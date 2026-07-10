import express, { Request, Response } from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import { BrevoClient } from "@getbrevo/brevo";
import multer from "multer";
import FormData from "form-data";

dotenv.config();

const brevo = new BrevoClient({
    apiKey: process.env.BREVO_API_KEY!,
});

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({
    storage: multer.memoryStorage(),
});

// Middleware
app.use(express.json()); // For parsing application/json
app.use(cors()); // Enable CORS for all routes

// API endpoint for handling successful payments
app.post('/api/manual-payment', upload.single("receipt"), async (req: Request, res: Response) => {
    const { name, email, phone, program, training, amount, reference } = req.body;

    const receipt = req.file;

    if (
        !name ||
        !email ||
        !phone ||
        !program ||
        !training ||
        !amount ||
        !reference
    ) {
        return res.status(400).json({
            success: false,
            message: "Please complete all required fields.",
        });
    }

    if (!receipt) {
        return res.status(400).json({
            success: false,
            message: "Please upload your payment receipt.",
        });
    }

    const paymentDate = new Date().toLocaleString("en-NG", {
        timeZone: "Africa/Lagos",
        dateStyle: "full",
        timeStyle: "short",
    });

    try {
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
                subject: "Payment In Process - Aceline Growth Training",

                htmlContent: `
<h2>Payment Submission Received</h2>

<p>Dear <strong>${name}</strong>,</p>

<p>
Thank you for submitting your payment for the
<strong>${program}</strong>.
</p>

<p>Your payment details have been received successfully.</p>

<table cellpadding="8">
<tr><td><strong>Program</strong></td><td>${program}</td></tr>
<tr><td><strong>Training</strong></td><td>${training}</td></tr>
<tr><td><strong>Amount</strong></td><td>₦${Number(amount).toLocaleString()}</td></tr>
<tr><td><strong>Reference</strong></td><td>${reference}</td></tr>
<tr><td><strong>Date Submitted</strong></td><td>${paymentDate}</td></tr>
</table>

<p>
Our finance team will verify your bank transfer shortly.
Once confirmed, you will receive another email confirming your enrollment.
</p>

<p>
Thank you for choosing Aceline International Limited.
</p>
`,
                textContent: `Dear ${name},
Thank you for your payment for the Aceline Growth Training!
Here are your payment details:
Program: ${program}
Training Type: ${training}
Amount Paid: NGN ${amount}
Reference: ${reference}
Email: ${email}
Phone: ${phone}
We will be in touch shortly with details on how to access your training.
Best regards,
The Aceline Team`,
            });

            await brevo.transactionalEmails.sendTransacEmail({
                sender: {
                    email: process.env.BREVO_FROM_EMAIL!,
                    name: process.env.BREVO_FROM_NAME!,
                },

                to: [
                    {
                        email: "acelineintl@gmail.com",
                        name: "Aceline Admin",
                    },
                ],

                subject: `New Ticket Purchased - ${reference}`,

                htmlContent: `
        <h2>New Ticket Purchased</h2>

        <table cellpadding="8">

        <tr>
        <td><strong>Name</strong></td>
        <td>${name}</td>
        </tr>

        <tr>
        <td><strong>Email</strong></td>
        <td>${email}</td>
        </tr>

        <tr>
        <td><strong>Phone</strong></td>
        <td>${phone}</td>
        </tr>

        <tr>
        <td><strong>Program</strong></td>
        <td>${program}</td>
        </tr>

        <tr>
        <td><strong>Training</strong></td>
        <td>${training}</td>
        </tr>

        <tr>
        <td><strong>Amount</strong></td>
        <td>₦${Number(amount).toLocaleString()}</td>
        </tr>

        <tr>
        <td><strong>Reference</strong></td>
        <td>${reference}</td>
        </tr>

        <tr>
        <td><strong>Submitted</strong></td>
        <td>${paymentDate}</td>
        </tr>

        </table>

        <p>The customer's receipt is attached.</p>
    `,

                attachment: [
                    {
                        name: receipt.originalname,
                        content: receipt.buffer.toString("base64"),
                    },
                ],
            });

            console.log('Email sent successfully via Brevo for transaction:', reference);
        } catch (brevoError: any) {
            console.error('Error sending email via Brevo:', brevoError.body || brevoError.message);
            // Decide if you want to return an error here or continue with other steps
        }

        // 3. Store payment details (example: log to console, integrate with a CRM/DB here)
        console.log('Storing payment details:', {
            name, email, phone, program, training, amount, reference,
        });

        // 4. Send client details to a third-party form service
        const formspreeEndpoint = process.env.FORMSPREE_ENDPOINT;

        if (formspreeEndpoint) {
            try {
                const form = new FormData();

                form.append("name", name);
                form.append("email", email);
                form.append("phone", phone);
                form.append("program", program);
                form.append("training", training);
                form.append("amount", amount);
                form.append("reference", reference);
                form.append("payment_method", "Bank Transfer");
                form.append("payment_date", paymentDate);

                await axios.post(
                    process.env.FORMSPREE_ENDPOINT!,
                    form,
                    {
                        headers: form.getHeaders(),
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
        return res.status(200).json({
            success: true,
            message:
                "Your payment details have been received successfully. We will verify your transfer and contact you shortly.",
        });


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