import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';

const app = express();
// app.use(bodyParser.json());
app.use(express.json());

app.post('/register-token', async (req, res) => {
  console.log('Received request to register token');
  const { token } = req.body;
  console.log('Received push token:', token);

  console.log('Sending push notification...');
  const message = {
    to: token,
    sound: 'default',
    title: 'Test Push',
    body: 'This is a push notification from backend',
  };

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });

  res.send({ success: true });
});

app.post('/test-notification', async (req, res) => {
  console.log('Received request to send test-notification');
  console.log('req.body =', req.body);

  const { token } = req.body;

  if (!token) {
    return res.status(400).send({ error: 'Missing push token' });
  }

  const message = {
    to: token,
    sound: 'default',
    title: '📆 Test Notification',
    body: 'This is a test push notification from the NOT_COOL backend!',
    data: { test: true },
  };

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    console.log('Expo push response:', result);

    res.send({ success: true, result });
  } catch (error) {
    console.error('Error sending push notification:', error);
    res.status(500).send({ error: 'Failed to send push notification' });
  }
});

app.post('/due-notification', async (req, res) => {
  console.log('Received request to send test-notification');

  const { token, until_due, task_name } = req.body;

  if (!token) {
    return res.status(400).send({ error: 'Missing push token' });
  }

  const message = {
    to: token,
    sound: 'default',
    title: '⏰Task Due Soon',
    body: `Your task "${task_name}" is due in ${until_due / 3600} hours!`,
    data: { test: true },
  };

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    console.log('Expo push response:', result);

    res.send({ success: true, result });
  } catch (error) {
    console.error('Error sending push notification <due-notification>:', error);
    res.status(500).send({ error: 'Failed to send push notification <due-notification>' });
  }
});

app.listen(3000, '0.0.0.0', () => {
  console.log('🚀 Backend running on http://0.0.0.0:3000');
});
