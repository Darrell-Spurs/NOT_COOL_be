import express from 'express';
import fetch from 'node-fetch';
import { db } from "./firebaseConfig.js";
import { doc, collection, setDoc, getDocs, query, where, Timestamp, serverTimestamp } from "firebase/firestore";

const app = express();
app.use(express.json());

// Notification
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


// Create New Objects
app.post('/user', async (req, res) => {
  const { UserName } = req.body;

  if (!UserName) {
    return res.status(400).json({ success: false, message: 'UserName is required' });
  }
  
  try {
      const docRef = doc(collection(db, "User"));
      const UserID = docRef.id;
    
      const data = {
          UserID,
          UserName,
  };
  
  await setDoc(docRef, data);

  return res.status(201).json({ success: true, UserID });
  } catch (error) {
      console.error('Error adding user:', error);
      return res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/task', async (req, res) => {
  const { 
    UserID,
    TaskName,
    TaskDetail,
    EndTime, 
    Child,
    Parent,
    Penalty,
    ExpectedTime,
    Member
  } = req.body;
  if (!UserID || !TaskName || !TaskDetail || !EndTime) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  try{
      const docRef = doc(collection(db, "Task"));
      const TaskID = docRef.id;
      const State = "On";
  
      const finalMember = Member ?? [UserID]; // 如果沒提供 Member，就預設為 [UserID]

      const data = {
          TaskID,
          UserID,
          TaskName,
          TaskDetail,
          CreatedTime: serverTimestamp(),
          EndTime: Timestamp.fromDate(new Date(EndTime)),
          State,
          Child,
          Parent,
          Penalty,
          ExpectedTime,
          Member: finalMember
      };
      
      await setDoc(docRef, data);
      
      return res.status(201).json({ success: true, id: TaskID });
    } catch (error) {
        console.error('Error adding task:', error);
        return res.status(500).json({ success: false, error: error.message });
  }  
});

app.post('/meeting', async (req, res) => {
  const { TaskID, MeetingName, MeetingDetail, StartTime, Duration } = req.body;
  if (!TaskID || !MeetingName || !MeetingDetail || !StartTime || !Duration) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  try{
      const docRef = doc(collection(db, "Meeting"));
      const MeetingID = docRef.id;
  
      const data = {
          MeetingID,
          TaskID,
          MeetingName,
          MeetingDetail,
          StartTime: Timestamp.fromDate(new StartTime),
          Duration,
      };
      
      await setDoc(docRef, data);
      
      return res.status(201).json({ success: true, id: MeetingID });
    } catch (error) {
        console.error('Error adding meeting:', error);
        return res.status(500).json({ success: false, error: error.message });
  }  
});

// Add user to a group (task.Member)
app.post('/group', async (req, res) => {
  const { UserID, TaskID } = req.body;
  if (!UserID || !TaskID ) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  try {
    const taskRef = db.collection('Task').doc(TaskID);

    // Update Member array: add only if not already present
    await taskRef.update({
      Member: admin.firestore.FieldValue.arrayUnion(UserID),
    });

    return res.status(200).json({ success: true, message: `User ${UserID} added to Task ${TaskID}` });
    } catch (error) {
        console.error('Error adding group:', error);
        return res.status(500).json({ success: false, error: error.message });
  }  
});

// User-related APIs

// 用username找id
app.get('/user-id/:username', async (req, res) => {
  try {
    const userName = req.params.username;

    const q = query(
        collection(db, "User"),
        where("UserName", "==", userName)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
        return { success: false, message: `User ${userName} Not Found.` };
    }

    const userData = snapshot.docs[0].data();
    return res.json({ success: true, UserID: userData.UserID });

  } catch (error) {
    console.error('Error fetching user ID:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 依據UserID獲取task
app.get('/user-tasks/:userID', async (req, res) => {
  try {
    const userID = req.params.userID;

    const q = query(
        collection(db, "Task"),
        where("Member", "array-contains", userID),
        where("State", "==", "On")
    );

    const snapshot = await getDocs(q);
    const taskList = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        TaskID: data.TaskID,
        UserID: userID,
        TaskName: data.TaskName,
        TaskDetail: data.TaskDetail,
        CreatedTime: data.CreatedTime?.toDate?.() ?? null,
        EndTime: data.EndTime?.toDate?.() ?? null,
        State: data.State,
        Member: data.Member,
      };
    });

    return res.json({ success: true, tasks: taskList });

  } catch (error) {
    console.error('Error fetching user tasks:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 依據UserID獲取meeting
app.get('/user-meetings/:userID', async (req, res) => {
  try {
    const userID = req.params.userID;

    const taskQuery = query(
        collection(db, "Task"),
        where("UserID", "==", userID)
    );
    const taskSnapshot = await getDocs(taskQuery);

    const taskIDs = taskSnapshot.docs.map(doc => doc.data().TaskID);

    if (taskIDs.length === 0) {
      return res.json({ success: true, meetings: [] });
    }

    const meetingResults = [];
    const chunkSize = 10;

    for (let i = 0; i < taskIDs.length; i += chunkSize) {
      const chunk = taskIDs.slice(i, i + chunkSize);

      const meetingQuery = query(
          collection(db, "Meeting"),
          where("TaskID", "in", chunk)
      );
      const meetingSnapshot = await getDocs(meetingQuery);

      const meetings = meetingSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          TaskID: data.TaskID,
          MeetingID: data.MeetingID,
          MeetingName: data.MeetingName,
          MeetingDetail: data.MeetingDetail,
          StartTime: data.StartTime?.toDate?.() ?? null,
          Duration: data.Duration,
        };
      });

      meetingResults.push(...meetings);
    }

    return res.json({ success: true, meetings: meetingResults });

  } catch (error) {
    console.error('Error fetching user meetings:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});


app.listen(3000, '0.0.0.0', () => {
  console.log('🚀 Backend running on http://0.0.0.0:3000');
});
