import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INBOX_DIR = process.env.INBOX_DATA_DIR || path.join(__dirname, '../../data/inbox');
const INBOX_FILE = path.join(INBOX_DIR, 'messages.jsonl');

function ensureInboxDir() {
  if (!fs.existsSync(INBOX_DIR)) {
    fs.mkdirSync(INBOX_DIR, { recursive: true });
  }
}

class EmailProcessor {
  constructor() {
    this.forwardTo = process.env.FORWARD_EMAIL || 'abhinav.allam@abhinavall.net';
    this.transporter = nodemailer.createTransport({
      streamTransport: true,
      newline: 'unix',
      buffer: true,
    });
    ensureInboxDir();
  }

  persistMessage(record) {
    ensureInboxDir();
    fs.appendFileSync(INBOX_FILE, JSON.stringify(record) + '\n', 'utf8');
  }

  readAllRecords() {
    if (!fs.existsSync(INBOX_FILE)) return [];
    const raw = fs.readFileSync(INBOX_FILE, 'utf8').trim();
    if (!raw) return [];
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  listInbox(limit = 50) {
    const rows = this.readAllRecords();
    return rows
      .slice(-limit)
      .reverse()
      .map((m) => ({
        id: m.id,
        from: m.from,
        to: m.to,
        subject: m.subject,
        receivedAt: m.timestamp,
        preview: (m.text || '').slice(0, 160),
      }));
  }

  getMessage(id) {
    return this.readAllRecords().find((m) => m.id === id) || null;
  }

  async processIncomingEmail(emailData) {
    try {
      const timestamp = new Date().toISOString();
      const id = crypto.randomUUID();
      const from = emailData.from || 'unknown';
      const to = emailData.to || 'abhinav.allam@abhinavall.net';
      const subject = emailData.subject || '(no subject)';
      const body = emailData.text || emailData.html || '';
      const metadata = this.extractEmailMetadata(emailData);

      const record = {
        id,
        timestamp,
        from,
        to,
        subject,
        text: body,
        html: emailData.html || null,
        metadata,
      };

      this.persistMessage(record);

      console.log('\n=== Email Received ===');
      console.log(`ID: ${id}`);
      console.log(`Time: ${timestamp}`);
      console.log(`From: ${from}`);
      console.log(`Subject: ${subject}`);
      console.log('=====================\n');

      return { success: true, message: 'Email stored in inbox', metadata, id };
    } catch (error) {
      console.error('Email processing error:', error);
      return { success: false, error: error.message };
    }
  }

  extractEmailMetadata(emailData) {
    return {
      receivedAt: new Date().toISOString(),
      sender: {
        address: emailData.from,
        name: emailData.fromName || null,
        domain: this.extractDomain(emailData.from),
      },
      recipient: {
        address: emailData.to,
        localPart: emailData.to?.split('@')[0],
        domain: emailData.to?.split('@')[1],
      },
      message: {
        subject: emailData.subject,
        size: emailData.rawSize || (emailData.text?.length || 0),
        hasAttachments: emailData.attachments?.length > 0,
        attachmentCount: emailData.attachments?.length || 0,
      },
      headers: this.parseHeaders(emailData.headers),
      routing: {
        forwardedTo: this.forwardTo,
        processedBy: 'linuxbox-email-processor',
        processorVersion: '1.1.0',
      },
    };
  }

  extractDomain(email) {
    if (!email) return null;
    const match = email.match(/@(.+)$/);
    return match ? match[1] : null;
  }

  parseHeaders(headers) {
    if (!headers) return {};
    return {
      messageId: headers['message-id'],
      date: headers['date'],
      returnPath: headers['return-path'],
      replyTo: headers['reply-to'],
      contentType: headers['content-type'],
    };
  }
}

export default new EmailProcessor();
