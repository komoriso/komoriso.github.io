
const nodemailer = require('nodemailer');
const { runScraper } = require('./scraper');
require('dotenv').config();

// Config for Email (Async init to allow Ethereal fallback)
async function getTransporter() {
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        return nodemailer.createTransport({
            service: process.env.EMAIL_SERVICE || 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });
    } else {
        console.log('[MAIL] No SMTP credentials found. Creating an Ethereal test account...');
        const testAccount = await nodemailer.createTestAccount();
        return nodemailer.createTransport({
            host: "smtp.ethereal.email",
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: testAccount.user, // generated ethereal user
                pass: testAccount.pass, // generated ethereal password
            },
        });
    }
}

function getMailContent(reportStr, startDate, endDate) {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    return `
    <div style="font-family: sans-serif; color: #333;">
        <h2>新刊情報収集システム 定期レポート</h2>
        <p><strong>処理日時:</strong> ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</p>
        <p><strong>対象期間:</strong> ${startDate} 〜 ${endDate}</p>
        <p><strong>取得サマリー:</strong></p>
        <pre style="background: #f4f4f4; padding: 10px; border-radius: 4px;">${reportStr}</pre>
        <div style="margin-top: 20px;">
            <a href="${appUrl}" style="background: #007bff; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px;">新刊一覧ページを確認する</a>
        </div>
    </div>
    `;
}

async function executeWeeklyJob() {
    console.log('[CRON] Starting weekly job...');
    
    // Calculate targeted 1 month range to show on email
    const today = new Date();
    const start = new Date(today); start.setMonth(start.getMonth() - 1);
    const end = new Date(today); end.setMonth(end.getMonth() + 1);
    const strStart = start.toISOString().split('T')[0];
    const strEnd = end.toISOString().split('T')[0];

    try {
        const report = await runScraper();
        
        const transporter = await getTransporter();
        const mailOptions = {
            from: process.env.EMAIL_USER || '"Test Sender" <test@example.com>',
            to: 'comox1003@gmail.com',
            subject: '[定期通知] 新刊情報収集の結果',
            html: getMailContent(report, strStart, strEnd)
        };
        
        const info = await transporter.sendMail(mailOptions);
        console.log('[CRON] Email sent successfully.');
        
        if (!process.env.EMAIL_USER) {
            console.log('[CRON] Preview URL: %s', nodemailer.getTestMessageUrl(info));
        }
    } catch (e) {
        console.error('[CRON] Error during execution: ', e.message);
    }
}

if (require.main === module) {
    executeWeeklyJob().then(() => {
        console.log('Job complete.');
        process.exit(0);
    });
}

module.exports = { executeWeeklyJob };
