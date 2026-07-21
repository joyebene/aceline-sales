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

const upload = multer({ storage: multer.memoryStorage() });

// Middleware
app.use(express.json());
app.use(cors());

// ===================== MANUAL PAYMENT =====================
app.post('/api/manual-payment', upload.single("receipt"), async (req: Request, res: Response) => {
    const { name, email, phone, program, training, amount, reference } = req.body;
    const receipt = req.file;

    if (!name || !email || !phone || !program || !training || !amount || !reference) {
        return res.status(400).json({ success: false, message: "Please complete all required fields." });
    }
    if (!receipt) {
        return res.status(400).json({ success: false, message: "Please upload your payment receipt." });
    }

    const paymentDate = new Date().toLocaleString("en-NG", {
        timeZone: "Africa/Lagos",
        dateStyle: "full",
        timeStyle: "short",
    });

    try {
        await sendPaymentEmails(name, email, program, training, amount, reference, paymentDate, receipt.fieldname);
        await sendToFormspree(name, email, phone, program, training, amount, reference, paymentDate, "Bank Transfer");

        return res.status(200).json({
            success: true,
            message: "Your payment details have been received successfully.",
        });
    } catch (error: any) {
        console.error('Error processing manual payment:', error.message);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// ===================== PAYSTACK VERIFICATION =====================
app.post('/api/verify-payment', async (req: Request, res: Response) => {
    const { reference, name, email, phone, program, training, amount } = req.body;

    if (!reference) {
        return res.status(400).json({ success: false, message: "Reference is required" });
    }

    try {
        const response = await axios.get(
            `https://api.paystack.co/transaction/verify/${reference}`,
            {
                headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
            }
        );

        const data = response.data.data;

        if (data.status === "success") {
            const paymentDate = new Date().toLocaleString("en-NG", {
                timeZone: "Africa/Lagos",
                dateStyle: "full",
                timeStyle: "short",
            });

            await sendPaymentEmails(name, email, phone, program, training, amount, reference, paymentDate);
            await sendToFormspree(name, email, phone, program, training, amount, reference, paymentDate, "Paystack");

            return res.status(200).json({
                success: true,
                message: "Payment verified successfully!",
            });
        } else {
            return res.status(400).json({ success: false, message: "Payment not successful" });
        }
    } catch (error: any) {
        console.error("Paystack verification error:", error.response?.data || error.message);
        res.status(500).json({ success: false, message: "Verification failed" });
    }
});

// ===================== HELPER FUNCTIONS =====================

async function sendPaymentEmails(
    name: string,
    email: string,
    phone: string,
    program: string,
    training: string,
    amount: number | string,
    reference: string,
    paymentDate: string,
    receipt?: any
) {
    // 1. Email to Customer
    await brevo.transactionalEmails.sendTransacEmail({
        sender: {
            email: process.env.BREVO_FROM_EMAIL!,
            name: process.env.BREVO_FROM_NAME!,
        },
        to: [{ email, name }],
        subject: "Payment Confirmed - Aceline Growth Training",
        htmlContent: `
            <h2>Thank You, ${name}!</h2>
            <p>Your payment has been received successfully.</p>
            <table cellpadding="8" style="border-collapse: collapse;">
                <tr><td><strong>Program:</strong></td><td>${program}</td></tr>
                <tr><td><strong>Training:</strong></td><td>${training}</td></tr>
                <tr><td><strong>Amount:</strong></td><td>₦${Number(amount).toLocaleString()}</td></tr>
                <tr><td><strong>Reference:</strong></td><td>${reference}</td></tr>
                <tr><td><strong>Date:</strong></td><td>${paymentDate}</td></tr>
            </table>
            <p>Our team will send you access details shortly.</p>
        `,
    });

    // 2. Email to Admin
    await brevo.transactionalEmails.sendTransacEmail({
        sender: {
            email: process.env.BREVO_FROM_EMAIL!,
            name: process.env.BREVO_FROM_NAME!,
        },
        to: [{ email: "acelineintl@gmail.com", name: "Aceline Admin" }],
        subject: `New Payment - ${reference}`,
        htmlContent: `
            <h2>New Payment Received</h2>
            <table cellpadding="8">
                <tr><td><strong>Name</strong></td><td>${name}</td></tr>
                <tr><td><strong>Email</strong></td><td>${email}</td></tr>
                <tr><td><strong>Phone</strong></td><td>${phone || 'N/A'}</td></tr>
                <tr><td><strong>Program</strong></td><td>${program}</td></tr>
                <tr><td><strong>Training</strong></td><td>${training}</td></tr>
                <tr><td><strong>Amount</strong></td><td>₦${Number(amount).toLocaleString()}</td></tr>
                <tr><td><strong>Reference</strong></td><td>${reference}</td></tr>
                <tr><td><strong>Date</strong></td><td>${paymentDate}</td></tr>
            </table>
        `,
        attachment: receipt ? [{
            name: receipt.originalname,
            content: receipt.buffer.toString("base64"),
        }] : undefined,
    });
}

async function sendToFormspree(
    name: string,
    email: string,
    phone: string,
    program: string,
    training: string,
    amount: number | string,
    reference: string,
    paymentDate: string,
    method: string
) {
    const endpoint = process.env.FORMSPREE_ENDPOINT;
    if (!endpoint) return;

    try {
        const form = new FormData();
        form.append("name", name);
        form.append("email", email);
        form.append("phone", phone);
        form.append("program", program);
        form.append("training", training);
        form.append("amount", amount);
        form.append("reference", reference);
        form.append("payment_method", method);
        form.append("payment_date", paymentDate);

        await axios.post(endpoint, form, { headers: form.getHeaders() });
    } catch (err: any) {
        console.error("Formspree error:", err?.message);
    }
}

// Start Server
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});