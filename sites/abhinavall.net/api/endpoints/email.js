import express from 'express';
import emailProcessor from '../email/processor.js';
import { inboxAuth } from '../middleware/inboxAuth.js';

const router = express.Router();

router.post('/incoming', async (req, res) => {
  try {
    const emailData = req.body;
    if (!emailData || !emailData.from) {
      return res.status(400).json({ success: false, error: 'Invalid email data' });
    }
    const result = await emailProcessor.processIncomingEmail(emailData);
    if (result.success) {
      return res.status(200).json({
        success: true,
        message: 'Email processed successfully',
        id: result.id,
        metadata: result.metadata,
      });
    }
    return res.status(500).json({ success: false, error: result.error });
  } catch (error) {
    console.error('Email webhook error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error processing email' });
  }
});

router.get('/inbox', inboxAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  res.json({
    success: true,
    address: 'abhinav.allam@abhinavall.net',
    count: emailProcessor.listInbox(limit).length,
    messages: emailProcessor.listInbox(limit),
  });
});

router.get('/inbox/:id', inboxAuth, (req, res) => {
  const message = emailProcessor.getMessage(req.params.id);
  if (!message) {
    return res.status(404).json({ success: false, error: 'Message not found' });
  }
  return res.json({ success: true, message });
});

router.post('/test', inboxAuth, async (req, res) => {
  try {
    const testEmail = {
      from: req.body.from || 'test@example.com',
      to: 'abhinav.allam@abhinavall.net',
      subject: req.body.subject || 'Test Email',
      text: req.body.text || 'This is a test email',
      headers: {
        'message-id': '<test@example.com>',
        date: new Date().toISOString(),
      },
      rawSize: 1024,
    };
    const result = await emailProcessor.processIncomingEmail(testEmail);
    res.json({ success: true, message: 'Test email stored', result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/stats', inboxAuth, (req, res) => {
  res.json({
    success: true,
    stats: {
      emailAddress: 'abhinav.allam@abhinavall.net',
      forwardTo: process.env.FORWARD_EMAIL || 'abhinav.allam@abhinavall.net',
      processorStatus: 'active',
      version: '1.1.0',
      stored: emailProcessor.listInbox(500).length,
    },
  });
});

export default router;
