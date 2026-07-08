import express, { Request, Response } from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import { BrevoClient } from "@getbrevo/brevo";

dotenv.config();

const brevo = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY!,
});

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json()); // For parsing application/json
app.use(cors()); // Enable CORS for all routes

// API endpoint for handling successful payments
app.post('/api/payment-success', async (req: Request, res:Response) => {
    const { name, email, phone, program, training, amount, transaction_id } = req.body;

    if (!transaction_id) {
        return res.status(400).json({ success: false, message: 'Transaction ID is required.' });
    }

    try {
        // 1. Verify payment with Flutterwave
        const verificationResponse = await axios.get(
            `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
                },
            }
        );

        const transaction = verificationResponse.data.data;

        if (transaction.status === 'successful' && Number(transaction.amount) === Number(amount) && transaction.currency === 'NGN') {
            // Payment is verified and successful

            // 2. Send email notification using Brevo
            try {
                await brevo.transactionalEmails.sendTransacEmail({
                    sender: {
                        email: process.env.BREVO_FROM_EMAIL!,
                        name: process.env.BREVO_FROM_NAME!,
                    },
                    to: [
                        {
                            email: email,
                            name: name,
                        },
                    ],
                    subject: 'Aceline: Payment Confirmation & Enrollment',
                    htmlContent: `
                        <p>Dear ${name},</p>
                        <p>Thank you for your payment for the Aceline Growth Training!</p>
                        <p>Here are your payment details:</p>
                        <ul>
                            <li><strong>Program:</strong> ${program}</li>
                            <li><strong>Training Type:</strong> ${training}</li>
                            <li><strong>Amount Paid:</strong> NGN ${amount}</li>
                            <li><strong>Transaction ID:</strong> ${transaction_id}</li>
                            <li><strong>Email:</strong> ${email}</li>
                            <li><strong>Phone:</strong> ${phone}</li>
                        </ul>
                        <p>We will be in touch shortly with details on how to access your training.</p>
                        <p>Best regards,</p>
                        <p>The Aceline Team</p>
                    `,
                    textContent: `Dear ${name},
Thank you for your payment for the Aceline Growth Training!
Here are your payment details:
Program: ${program}
Training Type: ${training}
Amount Paid: NGN ${amount}
Transaction ID: ${transaction_id}
Email: ${email}
Phone: ${phone}
We will be in touch shortly with details on how to access your training.
Best regards,
The Aceline Team`,
                });
                console.log('Email sent successfully via Brevo for transaction:', transaction_id);
            } catch (brevoError: any) {
                console.error('Error sending email via Brevo:', brevoError.body || brevoError.message);
                // Decide if you want to return an error here or continue with other steps
            }

            // 3. Store payment details (example: log to console, integrate with a CRM/DB here)
            console.log('Storing payment details:', {
                name, email, phone, program, training, amount, transaction_id,
                flutterwave_data: transaction // Store full Flutterwave response if needed
            });
            // In a real application, you would integrate with a database or CRM here.
            // Example: saveToDatabase({ name, email, ... });

            // 4. Send client details to a third-party form service
            const formspreeEndpoint = process.env.FORMSPREE_ENDPOINT;

            if (formspreeEndpoint) {
                try {
                    await axios.post(
                        formspreeEndpoint,
                        {
                            name,
                            email,
                            phone,
                            program,
                            training,
                            amount,
                            transaction_id,
                            payment_status: transaction.status,
                            payment_reference: transaction.tx_ref,
                            payment_method: transaction.payment_type,
                            currency: transaction.currency,
                            paid_at: transaction.created_at,
                        },
                        {
                            headers: {
                                "Content-Type": "application/json",
                                Accept: "application/json",
                            },
                        }
                    );

                    console.log("Customer data sent to Formspree successfully.");
                } catch (err: any) {
                    console.error(
                        "Failed to send customer data to Formspree:",
                        err?.response?.data || err?.message!
                    );
                }
            } else {
                console.warn("FORMSPREE_ENDPOINT is missing.");
            }
            res.status(200).json({ success: true, message: 'Payment processed, email sent, and data stored.' });

        } else {
            // Payment verification failed or amount/currency mismatch
            console.error('Payment verification failed for transaction:', transaction_id, transaction);
            res.status(400).json({ success: false, message: 'Payment verification failed or details mismatch.' });
        }

    } catch (error: any) {
        console.error('Error processing payment:', error.message);
        if (error.response) {
            console.error('Flutterwave API error:', error.response.data);
        }
        res.status(500).json({ success: false, message: 'Internal server error during payment processing.' });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
});