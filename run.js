import fs from "fs";
import path from "path";
import mailer from "nodemailer";
import jwt from "jsonwebtoken";

const STATE_FILE = path.resolve("./notified_quizzes.json");

let notifiedQuizzes = new Set();
try {
  if (fs.existsSync(STATE_FILE)) {
    notifiedQuizzes = new Set(JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")));
  }
} catch {
  notifiedQuizzes = new Set();
}

function saveNotificationKey(key) {
  notifiedQuizzes.add(key);
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify([...notifiedQuizzes], null, 2));
  } catch (err) {
    console.error("Failed to save state cache:", err.message);
  }
}

const subjectName = {
  2717: "Design and Analysis of Algorithms",
  2743: "Stochastic Process and Financial Mathematics",
  2766: "Discrete Mathematical Structures (A)",
  2928: "Problem Solving through Python Programming Lab",
  3108: "Cyber Security(BATCH A)",
  3275: "Design and Analysis of Algorithms Lab",
  3407: "Semester Proficiency A",
  3742: "Software Development - I",
  3922: "Operating System",
  3925: "Simulation Modeling and Analysis Section A",
  3972: "Simulation Modeling and Analysis Lab Section A",
};

const emails = (process.env.EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const subjects = (process.env.SUBJECTS || "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => !isNaN(n));

const token = process.env.BEARER_TOKEN?.trim();

const transporter = mailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendEmailAll({ subject, text }) {
  for (const to of emails) {
    try {
      const info = await transporter.sendMail({
        from: `"Quiz Caller" <${process.env.SMTP_USER}>`,
        to,
        subject,
        text,
      });
      console.log(`Dispatched to ${to} [${info.messageId}]`);
    } catch (err) {
      console.error(`Error sending email to ${to}:`, err.message);
    }
  }
}

function checkTokenValidity(tok) {
  if (!tok) throw new Error("Bearer token is missing");
  const decoded = jwt.decode(tok);
  if (!decoded || !decoded.exp) throw new Error("Token is unreadable or malformed");

  const currentTime = Math.floor(Date.now() / 1000);
  if (decoded.exp - 300 <= currentTime) {
    throw new Error("Token expired or will expire within 5 minutes");
  }
}

function formatIST(dateObj) {
  return dateObj.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

async function main() {
  if (emails.length === 0 || subjects.length === 0) {
    console.error("No valid emails or subjects configured.");
    return;
  }

  await sendEmailAll({
  subject: "GitHub Action Test Email",
  text: "GitHub Action is dispatching emails properly!",
  });

  try {
    checkTokenValidity(token);
  } catch (e) {
    console.error("Token error:", e.message);
    const tokenAlertKey = `token_expiry_${new Date().toDateString()}`;
    if (!notifiedQuizzes.has(tokenAlertKey)) {
      saveNotificationKey(tokenAlertKey);
      await sendEmailAll({
        subject: `Quiz Caller: ${e.message}`,
        text: `Bearer Token Update Required: ${e.message}\nUpdate your GitHub repository secret.`,
      });
    }
    return;
  }

  const minutesBefore = Number(process.env.MINUTES_BEFORE) || 15;
  const millisBefore = minutesBefore * 60 * 1000;
  const now = new Date();

  for (const courseId of subjects) {
    try {
      const response = await fetch(
        `https://ams.mitsgwalior.in/api/api/v1/quiz/student/course/${courseId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        console.warn(`Fetch error for course ${courseId}: HTTP ${response.status}`);
        continue;
      }

      const quizzes = await response.json();
      if (!Array.isArray(quizzes)) continue;

      for (const quiz of quizzes) {
        if (quiz.status === "ended") continue;

        const quizId = quiz.id;
        const startTime = new Date(quiz.start_time);
        const endTime = new Date(quiz.end_time);
        const startDiff = startTime - now;

        const subName = subjectName[courseId] || `Course ${courseId}`;
        const startFormatted = formatIST(startTime);
        const endFormatted = formatIST(endTime);

        const upcomingKey = `${quizId}_upcoming`;
        const startedKey = `${quizId}_started`;

        if (startDiff >= 0 && startDiff <= millisBefore && !notifiedQuizzes.has(upcomingKey)) {
          saveNotificationKey(upcomingKey);
          await sendEmailAll({
            subject: `${subName} Quiz: ${quiz.name} starts at ${startFormatted}`,
            text: `${subName} (Course ID: ${courseId}) has a quiz starting soon.\n\nQuiz Details:\n- Name: ${quiz.name}\n- Duration: ${quiz.duration_minutes} Minutes\n- Starts: ${startFormatted}\n- Ends: ${endFormatted}\n- Link: https://ams.mitsgwalior.in/student/courses/${courseId}/quiz\n\nKindly open the quiz on Firefox!\n\nCreated by Mridul Saha!`,
          });
        }

        if (now >= startTime && now <= endTime && !notifiedQuizzes.has(startedKey)) {
          saveNotificationKey(startedKey);
          await sendEmailAll({
            subject: `Important: ${subName} Quiz: ${quiz.name} has STARTED`,
            text: `${subName} (Course ID: ${courseId}) has a quiz currently live.\n\nQuiz Details:\n- Name: ${quiz.name}\n- Duration: ${quiz.duration_minutes} Minutes\n- Started: ${startFormatted}\n- Ends: ${endFormatted}\n- Link: https://ams.mitsgwalior.in/student/courses/${courseId}/quiz\n\nKindly open the quiz on Firefox!\n\nCreated by Mridul Saha!`,
          });
        }
      }
    } catch (err) {
      console.error(`Error querying course ${courseId}:`, err.message);
    }
  }
}

main().catch(console.error);
