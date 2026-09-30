import mailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const { SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_PORT, EMAILS } = process.env;

console.log("Testing SMTP connection with:", {
  host: SMTP_HOST,
  port: SMTP_PORT,
  user: SMTP_USER,
});

const transporter = mailer.createTransport({
  host: SMTP_HOST || "smtp.gmail.com",
  port: Number(SMTP_PORT) || 465,
  secure: Number(SMTP_PORT) === 465,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

async function runTest() {
  try {
    console.log("Verifying credentials with mail server...");
    await transporter.verify();
    console.log("✓ SMTP Server is ready to send messages!");

    const recipients = (EMAILS || SMTP_USER)
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);

    console.log(`Sending test email to: ${recipients.join(", ")}...`);

    const info = await transporter.sendMail({
      from: `"Quiz Caller Test" <${SMTP_USER}>`,
      to: recipients,
      subject: "Quiz Caller: Email Delivery Test",
      text: "If you received this email, your SMTP settings and credentials are working perfectly!",
    });

    console.log(`✓ Email sent successfully! Message ID: ${info.messageId}`);
  } catch (error) {
    console.error("✗ Email test failed:");
    console.error(error);
  }
}

runTest();
