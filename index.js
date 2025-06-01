import express from 'express';
import fetch from 'node-fetch';
import { db } from "./firebaseConfig.js";
import admin from 'firebase-admin';
import { doc, getDoc, updateDoc, collection, setDoc, getDocs, deleteDoc, query, arrayUnion, arrayRemove, where, Timestamp, serverTimestamp } from "firebase/firestore";
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger.js';
import { spawn } from "child_process";
import cors from 'cors';
import os from 'os';
import { get } from 'http';

function getLocalIP() {
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      const isIPv4 = iface.family === 'IPv4';
      const isNotInternal = !iface.internal;

      // Ignore VirtualBox, Docker, VPNs by filtering interface names if needed
      const isRealInterface = !name.toLowerCase().includes('vmware') &&
        !name.toLowerCase().includes('virtual') &&
        !name.toLowerCase().includes('loopback');

      if (isIPv4 && isNotInternal && isRealInterface) {
        return iface.address;
      }
    }
  }

  return '127.0.0.1'; // fallback
}

const app = express();
app.use(cors());
app.use(express.json());


// Notification
// Register push token and send a test notification
/**
 * @swagger
 * /tokens/push:
 *   post:
 *     tags:
 *       - Notifications
 *     summary: Register push token and send test notification
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 description: Expo push notification token
 *             required:
 *               - token
 *     responses:
 *       200:
 *         description: Test notification sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Bad request - missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Missing push token"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to send push notification"
 */
app.post('/tokens/push', async (req, res) => {
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

// Test notification endpoint
/**
 * @swagger
 * /notifications/test:
 *   post:
 *     tags:
 *       - Notifications
 *     summary: Send test notification manually
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 description: Expo push notification token
 *             required:
 *               - token
 *     responses:
 *       200:
 *         description: Test notification sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 result:
 *                   type: object
 *                   description: Response from Expo push service
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           status:
 *                             type: string
 *                             example: "ok"
 *                           id:
 *                             type: string
 *                             example: "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
 *       400:
 *         description: Bad request - missing push token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Missing push token"
 *       500:
 *         description: Internal server error - failed to send notification
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to send push notification"
 */
app.post('/notifications/test', async (req, res) => {
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

// Endpoint to send a notification when a task is due soon
/**
 * @swagger
 * /notifications/due:
 *   post:
 *     tags:
 *       - Notifications
 *     summary: Send a due-task notification
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 description: Expo push notification token
 *               until_due:
 *                 type: integer
 *                 description: Time until due in seconds
 *                 example: 3600
 *               task_name:
 *                 type: string
 *                 description: Name of the task that is due
 *                 example: "Complete project report"
 *             required:
 *               - token
 *               - until_due
 *               - task_name
 *     responses:
 *       200:
 *         description: Due task notification sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 result:
 *                   type: object
 *                   description: Response from Expo push service
 *       400:
 *         description: Bad request - missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Missing push token"
 *       500:
 *         description: Internal server error - failed to send notification
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to send push notification <due-notification>"
 */
app.post('/notifications/due', async (req, res) => {
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

// TODO
// app.post()

// Create New 
// Create a new user
/**
 * @swagger
 * /users:
 *   post:
 *     tags:
 *       - Users
 *     summary: Create a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               UserName:
 *                 type: string
 *                 description: Username for the new user
 *                 example: "john_doe"
 *               Password:
 *                 type: string
 *                 description: Password for the new user
 *                 example: "j0hNn_dO3"
 *             required:
 *               - UserName
 *               - Password
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 UserID:
 *                   type: string
 *                   description: Auto-generated unique user ID
 *                   example: "user_123456789"
 *       400:
 *         description: Bad request - missing UserName
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "UserName is required"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Database connection failed"
 */
app.post('/users', async (req, res) => {
  const { UserName, Password } = req.body;

  if (!UserName) {
    return res.status(400).json({ success: false, message: 'UserName is required' });
  }

  try {
    const docRef = doc(collection(db, "User"));
    const UserID = docRef.id;

    const data = {
      UserID,
      UserName,
      Password,
      Arrange: 0
    };

    await setDoc(docRef, data);

    return res.status(201).json({ success: true, UserID });
  } catch (error) {
    console.error('Error adding user:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /login:
 *   post:
 *     summary: Authenticate user
 *     tags:
 *       - Users
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [UserID, Password]
 *             properties:
 *               UserID:
 *                 type: string
 *               Password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 *       404:
 *         description: User not found
 */
app.post('/login', async (req, res) => {
  const { UserID, Password } = req.body;

  if (!UserID || !Password) {
    return res.status(400).json({ success: false, message: "UserID and Password are required." });
  }

  try {
    const userDoc = await getDoc(doc(db, 'User', UserID));
    if (!userDoc.exists()) {
      return res.status(404).json({ success: false, message: `User ${UserID} not found.` });
    }

    const userData = userDoc.data();
    if (userData.Password !== Password) {
      return res.status(401).json({ success: false, message: "Incorrect password." });
    }

    return res.status(200).json({ success: true, message: "Login successful", user: userData });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Create a new task 
/**
 * @swagger
 * /tasks:
 *   post:
 *     tags:
 *       - Tasks
 *     summary: Create a new task
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               UserID:
 *                 type: string
 *                 description: ID of the user creating the task
 *                 example: "user_123456789"
 *               TaskName:
 *                 type: string
 *                 description: Name of the task
 *                 example: "Complete project report"
 *               TaskDetail:
 *                 type: string
 *                 description: Detailed description of the task
 *                 example: "Write a comprehensive report on the project findings"
 *               EndTime:
 *                 type: string
 *                 format: date-time
 *                 description: Due date and time for the task
 *                 example: "2024-02-15T23:59:59.000Z"
 *               Parent:
 *                 type: string
 *                 description: Parent task ID (default "NULL")
 *                 example: "task_parent123"
 *               Penalty:
 *                 type: number
 *                 description: Penalty score for late completion (default 0)
 *                 example: 10
 *               ExpectedTime:
 *                 type: number
 *                 description: Expected time to complete in minutes (default 60)
 *                 example: 120
 *             required:
 *               - UserID
 *               - TaskName
 *               - TaskDetail
 *               - EndTime
 *     responses:
 *       201:
 *         description: Task created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 TaskID:
 *                   type: string
 *                   description: Auto-generated unique task ID
 *                   example: "task_123456789"
 *       400:
 *         description: Bad request - missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "All fields are required"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Database connection failed"
 */
app.post('/tasks', async (req, res) => {
  const {
    UserID,
    TaskName,
    TaskDetail,
    EndTime,
    Parent = "NULL",
    Penalty = 0,
    ExpectedTime = 60,
  } = req.body;

  if (!UserID || !TaskName || !TaskDetail || !EndTime) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  try {
    const docRef = doc(collection(db, "Task"));
    const TaskID = docRef.id;
    const State = "On";

    const Child = [];
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
      Member: [UserID],
      UnfinishedMember: [UserID],
    };

    await setDoc(docRef, data);

    if (Parent !== "NULL") {
      const parentRef = doc(db, "Task", Parent);
      await updateDoc(parentRef, {
        Child: arrayUnion(TaskID),
      });
    }

    return res.status(201).json({ success: true, TaskID: TaskID });
  } catch (error) {
    console.error('Error adding task:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get a task by its ID
/**
 * @swagger
 * /tasks/{taskID}:
 *   get:
 *     tags:
 *       - Tasks
 *     summary: Get a task by its ID
 *     description: Retrieve the full task object by its TaskID
 *     parameters:
 *       - in: path
 *         name: taskID
 *         required: true
 *         schema:
 *           type: string
 *         description: Task ID to retrieve
 *     responses:
 *       200:
 *         description: Task retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 task:
 *                   type: object
 *                   description: The full task object
 *       404:
 *         description: Task not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Task not found
 *       500:
 *         description: Internal server error
 */
app.get('/tasks/:taskID', async (req, res) => {
  const { taskID } = req.params;

  try {
    const taskRef = doc(db, "Task", taskID);
    const taskSnap = await getDoc(taskRef);

    if (!taskSnap.exists()) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const taskData = taskSnap.data();

    return res.status(200).json({ success: true, task: taskData });

  } catch (error) {
    console.error('Error fetching task:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /tasks/{taskID}:
 *   put:
 *     tags:
 *       - Tasks
 *     summary: Edit a task's allowed fields
 *     parameters:
 *       - in: path
 *         name: taskID
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the task to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               TaskName:
 *                 type: string
 *               TaskDetail:
 *                 type: string
 *               EndTime:
 *                 type: string
 *                 format: date-time
 *               ExpectedTime:
 *                 type: number
 *               Penalty:
 *                 type: number
 *     responses:
 *       200:
 *         description: Task updated successfully
 *       400:
 *         description: Invalid fields in request
 *       500:
 *         description: Server error
 */
app.put('/tasks/:taskID', async (req, res) => {
  const { taskID } = req.params;
  const updates = req.body;

  const allowedFields = ["EndTime", "ExpectedTime", "Penalty", "TaskDetail", "TaskName"];
  const updateData = {};

  for (const key of Object.keys(updates)) {
    if (!allowedFields.includes(key)) {
      return res.status(400).json({
        success: false,
        message: `Field "${key}" is not allowed to be updated.`,
      });
    }

    if (key === "EndTime") {
      updateData[key] = Timestamp.fromDate(new Date(updates[key]));
    } else {
      updateData[key] = updates[key];
    }
  }

  try {
    const taskRef = doc(db, "Task", taskID);
    await updateDoc(taskRef, updateData);

    return res.status(200).json({
      success: true,
      message: `Task ${taskID} updated successfully.`,
    });
  } catch (error) {
    console.error('Error updating task:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});



// User-related APIs
// get user ID by username
/**
 * @swagger
 * /users/by-username/{username}:
 *   get:
 *     tags:
 *       - Users
 *     summary: Get user ID by username
 *     parameters:
 *       - in: path
 *         name: username
 *         schema:
 *           type: string
 *         required: true
 *         description: Username to search for
 *         example: "john_doe"
 *     responses:
 *       200:
 *         description: UserID found successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 UserID:
 *                   type: string
 *                   description: The user's unique ID
 *                   example: "user_123456789"
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "User john_doe Not Found."
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Database query failed"
 */
app.get('/users/by-username/:username', async (req, res) => {
  try {
    const userName = req.params.username;

    const q = query(
      collection(db, "User"),
      where("UserName", "==", userName)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return res.status(404).json({ success: false, message: `User ${userName} not found.` });
    }

    const userData = snapshot.docs[0].data();
    return res.json({ success: true, UserID: userData.UserID });

  } catch (error) {
    console.error('Error fetching user ID:', error);
    return res.status(500).res.json({ success: false, message: `User ${userName} Not Found.` });
  }
});

// Get user root tasks by UserID
/**
 * @swagger
 * /users/{userID}/tasks/root:
 *   get:
 *     tags:
 *       - Users
 *       - Tasks
 *     summary: Get root tasks for a user
 *     parameters:
 *       - in: path
 *         name: userID
 *         required: true
 *         schema:
 *           type: string
 *         description: User's unique ID
 *         example: "user_123456789"
 *     responses:
 *       200:
 *         description: List of root tasks retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 tasks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       TaskID:
 *                         type: string
 *                         example: "task_123456789"
 *                       UserID:
 *                         type: string
 *                         example: "user_123456789"
 *                       TaskName:
 *                         type: string
 *                         example: "Complete project"
 *                       TaskDetail:
 *                         type: string
 *                         example: "Finish the final project for CS course"
 *                       CreatedTime:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-01-15T10:30:00.000Z"
 *                       EndTime:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-02-15T23:59:59.000Z"
 *                       State:
 *                         type: string
 *                         example: "On"
 *                       Member:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["user_123456789", "user_987654321"]
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Database query failed"
 */
app.get('/users/:userID/tasks/root', async (req, res) => {
  try {
    const userID = req.params.userID;

    const q = query(
      collection(db, "Task"),
      where("UnfinishedMember", "array-contains", userID),
      where("State", "==", "On"),
      where("Parent", "==", "NULL")
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
        Penalty: data.Penalty,
        ExpectedTime: data.ExpectedTime,
        Member: data.Member,
        UnfinishedMember: data.UnfinishedMember || []
      };
    });

    return res.json({ success: true, tasks: taskList });

  } catch (error) {
    console.error('Error fetching user tasks:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get user leaf tasks by UserID
/**
 * @swagger
 * /users/{userID}/tasks/leaf:
 *   get:
 *     tags:
 *       - Users
 *       - Tasks
 *     summary: Get leaf tasks for a user
 *     parameters:
 *       - in: path
 *         name: userID
 *         required: true
 *         schema:
 *           type: string
 *         description: User's unique ID
 *         example: "user_123456789"
 *     responses:
 *       200:
 *         description: List of leaf tasks retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 tasks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       TaskID:
 *                         type: string
 *                         example: "task_123456789"
 *                       UserID:
 *                         type: string
 *                         example: "user_123456789"
 *                       TaskName:
 *                         type: string
 *                         example: "Write introduction"
 *                       TaskDetail:
 *                         type: string
 *                         example: "Write the introduction section of the report"
 *                       CreatedTime:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-01-15T10:30:00.000Z"
 *                       EndTime:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-02-15T23:59:59.000Z"
 *                       State:
 *                         type: string
 *                         example: "On"
 *                       Member:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["user_123456789"]
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Database query failed"
 */
app.get('/users/:userID/tasks/leaf', async (req, res) => {
  try {
    const userID = req.params.userID;

    const q = query(
      collection(db, "Task"),
      where("UnfinishedMember", "array-contains", userID),
      where("State", "==", "On"),
    );

    const snapshot = await getDocs(q);
    const tasks = snapshot.docs;

    const filteredTasks = [];

    for (const taskDoc of tasks) {
      const data = taskDoc.data();
      const childIDs = data.Child || [];

      // ✅ child 為空或未定義，直接保留
      if (!childIDs || childIDs.length === 0) {
        filteredTasks.push({
          TaskID: data.TaskID,
          UserID: userID,
          TaskName: data.TaskName,
          TaskDetail: data.TaskDetail,
          CreatedTime: data.CreatedTime.toDate(),
          EndTime: data.EndTime.toDate(),
          State: data.State,
          Penalty: data.Penalty,
          ExpectedTime: data.ExpectedTime,
          Member: data.Member,
          UnfinishedMember: data.UnfinishedMember || []

        });
        console.log(`Task ${data.TaskID} has no children, keeping it.`);
        continue; // 跳過後面的 child 檢查
      }

      // 否則檢查 child 任務中是否包含該使用者
      const childDocs = await Promise.all(
        childIDs.map(id => getDoc(doc(db, "Task", id)))
      );

      const childHasUser = childDocs.some(childDoc => {
        const childData = childDoc.data();
        return childData?.Member?.includes(userID);
      });

      if (!childHasUser) {
        filteredTasks.push({
          TaskID: data.TaskID,
          UserID: userID,
          TaskName: data.TaskName,
          TaskDetail: data.TaskDetail,
          CreatedTime: data.CreatedTime.toDate(),
          EndTime: data.EndTime.toDate(),
          State: data.State,
          Member: data.Member,
          UnfinishedMember: data.UnfinishedMember || []
        });
        console.log(`Task ${data.TaskID} has no children with user ${userID}, keeping it.`);
      }
    }

    return res.json({ success: true, tasks: filteredTasks });

  } catch (error) {
    console.error('Error fetching user tasks:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get user finished root tasks by UserID
/**
 * @swagger
 * /users/{userID}/tasks/finished-root:
 *   get:
 *     tags:
 *       - Users
 *       - Tasks
 *     summary: Get finished root tasks for a user
 *     parameters:
 *       - in: path
 *         name: userID
 *         required: true
 *         schema:
 *           type: string
 *         description: User's unique ID
 *         example: "user_123456789"
 *     responses:
 *       200:
 *         description: List of finished root tasks retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 tasks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       TaskID:
 *                         type: string
 *                         example: "task_123456789"
 *                       UserID:
 *                         type: string
 *                         example: "user_123456789"
 *                       TaskName:
 *                         type: string
 *                         example: "Completed project"
 *                       TaskDetail:
 *                         type: string
 *                         example: "Successfully completed final project"
 *                       CreatedTime:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-01-15T10:30:00.000Z"
 *                       EndTime:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-02-15T23:59:59.000Z"
 *                       State:
 *                         type: string
 *                         example: "On"
 *                       Member:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["user_123456789", "user_987654321"]
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Database query failed"
 */
app.get('/users/:userID/tasks/finished-root', async (req, res) => {
  try {
    const userID = req.params.userID;

    const q = query(
      collection(db, "Task"),
      where("Member", "array-contains", userID),
      where("Unfinished", "!array-contains", userID),
      where("State", "==", "On"),
      where("Parent", "==", "NULL")
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
        Penalty: data.Penalty,
        ExpectedTime: data.ExpectedTime,
        Member: data.Member,
        UnfinishedMember: data.UnfinishedMember || [],
      };
    });

    return res.json({ success: true, tasks: taskList });

  } catch (error) {
    console.error('Error fetching user tasks:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get user finished leaf tasks by UserID
/**
 * @swagger
 * /users/{userID}/tasks/finished-leaf:
 *   get:
 *     tags:
 *       - Users
 *       - Tasks
 *     summary: Get finished leaf tasks for a user
 *     parameters:
 *       - in: path
 *         name: userID
 *         required: true
 *         schema:
 *           type: string
 *         description: User's unique ID
 *         example: "user_123456789"
 *     responses:
 *       200:
 *         description: List of finished leaf tasks retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 tasks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       TaskID:
 *                         type: string
 *                         example: "task_123456789"
 *                       UserID:
 *                         type: string
 *                         example: "user_123456789"
 *                       TaskName:
 *                         type: string
 *                         example: "Completed introduction"
 *                       TaskDetail:
 *                         type: string
 *                         example: "Successfully wrote introduction section"
 *                       CreatedTime:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-01-15T10:30:00.000Z"
 *                       EndTime:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-02-15T23:59:59.000Z"
 *                       State:
 *                         type: string
 *                         example: "On"
 *                       Member:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["user_123456789"]
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Database query failed"
 */
app.get('/users/:userID/tasks/finished-leaf', async (req, res) => {
  try {
    const userID = req.params.userID;

    const q = query(
      collection(db, "Task"),
      where("Member", "array-contains", userID),
      where("UnfinishedMember", "!array-contains", userID),
      where("State", "==", "On"),
    );

    const snapshot = await getDocs(q);
    const tasks = snapshot.docs;

    const filteredTasks = [];

    for (const taskDoc of tasks) {
      const data = taskDoc.data();
      const childIDs = data.child || [];

      // ✅ child 為空或未定義，直接保留
      if (!childIDs || childIDs.length === 0) {
        filteredTasks.push({
          TaskID: data.TaskID,
          UserID: userID,
          TaskName: data.TaskName,
          TaskDetail: data.TaskDetail,
          CreatedTime: data.CreatedTime.toDate(),
          EndTime: data.EndTime.toDate(),
          State: data.State,
          Penalty: data.Penalty,
          ExpectedTime: data.ExpectedTime,
          Member: data.Member,
          UnfinishedMember: data.UnfinishedMember || []
        });
        continue; // 跳過後面的 child 檢查
      }

      // 否則檢查 child 任務中是否包含該使用者
      const childDocs = await Promise.all(
        childIDs.map(id => getDoc(doc(db, "Task", id)))
      );

      const childHasUser = childDocs.some(childDoc => {
        const childData = childDoc.data();
        return childData?.Member?.includes(userID);
      });

      if (!childHasUser) {
        filteredTasks.push({
          TaskID: data.TaskID,
          UserID: userID,
          TaskName: data.TaskName,
          TaskDetail: data.TaskDetail,
          CreatedTime: data.CreatedTime.toDate(),
          EndTime: data.EndTime.toDate(),
          State: data.State,
          Member: data.Member
        });
      }
    }

    return res.json({ success: true, tasks: filteredTasks });

  } catch (error) {
    console.error('Error fetching user tasks:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Meetings-related APIs
/**
 * @swagger
 * /meetings:
 *   post:
 *     tags:
 *       - Meetings
 *     summary: Create a new meeting
 *     description: Adds a new meeting with the specified name, details, duration, and start time.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - MeetingName
 *               - Duration
 *               - StartTime
 *               - TaskID
 *             properties:
 *               TaskID:
 *                 type: string
 *                 example: "Task_123456789"
 *               MeetingName:
 *                 type: string
 *                 example: "Project Sync"
 *               MeetingDetail:
 *                 type: string
 *                 example: "Weekly sync-up with the development team"
 *               Duration:
 *                 type: number
 *                 example: 60
 *               StartTime:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-06-01T10:00:00.000Z"
 *     responses:
 *       201:
 *         description: Meeting created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Meeting created"
 *       400:
 *         description: Missing required fields
 *       500:
 *         description: Server error
 */
app.post('/meetings', async (req, res) => {
  const { MeetingName, MeetingDetail, Duration, StartTime, TaskID } = req.body;
  if (!MeetingName || !Duration || !StartTime || !TaskID) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  const docRef = doc(collection(db, 'Meeting'));
  const MeetingID = docRef.id;
  console.log('MeetingID:', MeetingID);
  try {
    await setDoc(doc(db, 'Meeting', MeetingID), {
      MeetingID: MeetingID,
      MeetingName: MeetingName,
      MeetingDetail: MeetingDetail || '',
      Duration,
      StartTime: Timestamp.fromDate(new Date(StartTime)),
      TaskID,
    });
    return res.status(201).json({ success: true, message: 'Meeting created', meetingID: MeetingID });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @swagger
 * /meetings/{MeetingID}:
 *   delete:
 *     tags:
 *       - Meetings
 *     summary: Delete a meeting
 *     parameters:
 *       - in: path
 *         name: MeetingID
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Meeting deleted successfully
 */
app.delete('/meetings/:MeetingID', async (req, res) => {
  const { MeetingID } = req.params;
  try {
    await deleteDoc(doc(db, 'Meeting', MeetingID));
    return res.status(200).json({ success: true, message: 'Meeting deleted' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Get user meetings by UserID
/**
 * @swagger
 * /users/{userID}/meetings:
 *   get:
 *     tags:
 *       - Meetings
 *     summary: Get meetings for a user
 *     parameters:
 *       - in: path
 *         name: userID
 *         required: true
 *         schema:
 *           type: string
 *         description: User's unique ID
 *         example: "user_123456789"
 *     responses:
 *       200:
 *         description: List of meetings retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 meetings:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       TaskID:
 *                         type: string
 *                         example: "task_123456789"
 *                       MeetingID:
 *                         type: string
 *                         example: "meeting_123456789"
 *                       MeetingName:
 *                         type: string
 *                         example: "Project kickoff meeting"
 *                       MeetingDetail:
 *                         type: string
 *                         example: "Initial meeting to discuss project requirements"
 *                       StartTime:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-01-20T14:00:00.000Z"
 *                       Duration:
 *                         type: number
 *                         description: Duration in minutes
 *                         example: 60
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Database query failed"
 */
app.get('/users/:userID/meetings', async (req, res) => {
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

// Edit a meeting by its ID
/**
 * @swagger
 * /meetings/{meetingID}:
 *   put:
 *     summary: Edit meeting by ID
 *     tags:
 *       - Meetings
 *     parameters:
 *       - in: path
 *         name: meetingID
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Fields to update
 *     responses:
 *       200:
 *         description: Meeting updated
 *       404:
 *         description: Meeting not found
 */
app.put('/meetings/:meetingID', async (req, res) => {
  const { meetingID } = req.params;
  const updates = req.body;

  try {
    const meetingRef = doc(db, 'Meeting', meetingID);
    const meetingSnap = await getDoc(meetingRef);

    if (!meetingSnap.exists()) {
      return res.status(404).json({ success: false, message: "Meeting not found." });
    }

    await updateDoc(meetingRef, updates);
    return res.status(200).json({ success: true, message: "Meeting updated." });
  } catch (error) {
    console.error("Update meeting error:", error);
    return res.status(500).json({ success: false, message: "Failed to update meeting." });
  }
});


// Task-related APIs
// Mark a task as finished by changing itself all its children's UnfinishedMember array
/**
 * @swagger
 * /tasks/{taskID}/finish:
 *   post:
 *     tags:
 *       - Tasks
 *     summary: Mark task and its children as finished for a user
 *     parameters:
 *       - in: path
 *         name: taskID
 *         required: true
 *         schema:
 *           type: string
 *         description: Task ID to mark as finished
 *         example: "task_123456789"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               TaskID:
 *                 type: string
 *                 description: Task ID to mark as finished
 *                 example: "task_123456789"
 *               UserID:
 *                 type: string
 *                 description: User ID who completed the task
 *                 example: "user_123456789"
 *             required:
 *               - TaskID
 *               - UserID
 *     responses:
 *       200:
 *         description: Task marked as finished successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "user_123456789 marked as finished in task_123456789 and its children"
 *       400:
 *         description: Bad request - missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "TaskID and UserID are required"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Database update failed"
 */
app.post('/tasks/:taskID/finish', async (req, res) => {
  const { TaskID, UserID } = req.body;

  if (!TaskID || !UserID) {
    return res.status(400).json({ success: false, message: 'TaskID and UserID are required' });
  }

  try {
    // Helper function: recursively update task and children
    const removeUserRecursively = async (taskID) => {
      const taskRef = doc(db, "Task", taskID);
      const taskSnap = await getDoc(taskRef);

      if (!taskSnap.exists) return;

      const taskData = taskSnap.data();
      const unfinishedMembers = taskData.UnfinishedMember || [];

      // If user not in this task, no need to update or go deeper
      if (!unfinishedMembers.includes(UserID)) return;

      // Remove the user
      await updateDoc(taskRef, {
        UnfinishedMember: arrayRemove(UserID),
      });

      // Recurse into child tasks if they exist
      const children = taskData.Child || [];
      for (const childID of children) {
        await removeUserRecursively(childID);
      }
    };

    // Start the process from the root task
    await removeUserRecursively(TaskID);

    return res.status(200).json({ success: true, message: `${UserID} marked as finished in ${TaskID} and its children` });
  } catch (error) {
    console.error("Error marking task finished:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /tasks/{taskID}/unfinish:
 *   post:
 *     tags:
 *       - Tasks
 *     summary: Mark task and its children as unfinished for a user
 *     parameters:
 *       - in: path
 *         name: taskID
 *         required: true
 *         schema:
 *           type: string
 *         description: Task ID to mark as unfinished
 *         example: "task_123456789"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               TaskID:
 *                 type: string
 *                 description: Task ID to mark as unfinished
 *                 example: "task_123456789"
 *               UserID:
 *                 type: string
 *                 description: User ID who uncompleted the task
 *                 example: "user_123456789"
 *             required:
 *               - TaskID
 *               - UserID
 *     responses:
 *       200:
 *         description: Task marked as unfinished successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "user_123456789 marked as unfinished in task_123456789 and its children"
 *       400:
 *         description: Bad request - missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "TaskID and UserID are required"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Database update failed"
 */
app.post('/tasks/:taskID/unfinish', async (req, res) => {
  const { TaskID, UserID } = req.body;

  if (!TaskID || !UserID) {
    return res.status(400).json({ success: false, message: 'TaskID and UserID are required' });
  }

  try {
    // Helper function: recursively update task and children
    const removeUserRecursively = async (taskID) => {
      const taskRef = doc(db, "Task", taskID);
      const taskSnap = await getDoc(taskRef);

      if (!taskSnap.exists) return;

      const taskData = taskSnap.data();
      const unfinishedMembers = taskData.UnfinishedMember || [];

      // If user not in this task, no need to update or go deeper
      if (!unfinishedMembers.includes(UserID)) return;

      // Remove the user
      await updateDoc(taskRef, {
        UnfinishedMember: arrayUnion(UserID),
      });

      // Recurse into child tasks if they exist
      const children = taskData.Child || [];
      for (const childID of children) {
        await removeUserRecursively(childID);
      }
    };

    // Start the process from the root task
    await removeUserRecursively(TaskID);

    return res.status(200).json({ success: true, message: `${UserID} marked as unfinished in ${TaskID} and its children` });
  } catch (error) {
    console.error("Error marking task unfinished:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a task by changing it state to "Deleted"
/**
 * @swagger
 * /tasks/{taskID}/delete:
 *   post:
 *     tags:
 *       - Tasks
 *     summary: Delete task and its children
 *     parameters:
 *       - in: path
 *         name: taskID
 *         required: true
 *         schema:
 *           type: string
 *         description: Task ID to delete
 *         example: "task_123456789"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               TaskID:
 *                 type: string
 *                 description: Task ID to delete
 *                 example: "task_123456789"
 *             required:
 *               - TaskID
 *     responses:
 *       200:
 *         description: Task marked as deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Deleted task_123456789 and its children"
 *       400:
 *         description: Bad request - missing TaskID
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "TaskID and UserID are required"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Database update failed"
 */
app.post('/tasks/:taskID/delete', async (req, res) => {
  const { TaskID } = req.body;

  if (!TaskID) {
    return res.status(400).json({ success: false, message: 'TaskID and UserID are required' });
  }

  try {
    // Helper function: recursively update task and children
    const removeUserRecursively = async (taskID) => {
      const taskRef = doc(db, "Task", taskID);
      const taskSnap = await getDoc(taskRef);

      if (!taskSnap.exists) return;

      const taskData = taskSnap.data();

      // Remove the user
      // await taskRef.update({
      //   State: "Deleted",
      // });
      await updateDoc(taskRef, {
        State: "Deleted",
      });

      // Recurse into child tasks if they exist
      const children = taskData.Child || [];
      for (const childID of children) {
        await removeUserRecursively(childID);
      }
    };

    // Start the process from the root task
    await removeUserRecursively(TaskID);

    return res.status(200).json({ success: true, message: `Deleted ${TaskID} and its children` });
  } catch (error) {
    console.error("Error marking task finished:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Add user to a task 
/**
 * @swagger
 * /tasks/{taskID}/members:
 *   post:
 *     tags:
 *       - Tasks
 *     summary: Add user to a task and its ancestors
 *     parameters:
 *       - in: path
 *         name: taskID
 *         required: true
 *         schema:
 *           type: string
 *         description: Task ID to add user to
 *         example: "task_123456789"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               UserID:
 *                 type: string
 *                 description: User ID to add to the task
 *                 example: "user_123456789"
 *             required:
 *               - UserID
 *     responses:
 *       200:
 *         description: User added to task and ancestors successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "User user_123456789 added to Task task_123456789 and all ancestors."
 *       400:
 *         description: Bad request - missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "UserID and TaskID are required"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Database update failed"
 */
app.post('/tasks/:taskID/members', async (req, res) => {
  const { UserID } = req.body;
  const { taskID } = req.params;

  if (!UserID) {
    return res.status(400).json({ success: false, message: 'UserID are required' });
  }

  try {
    // Recursive function to walk up parent chain and update Member + UnfinishedMember
    const updateTaskAndAncestors = async (taskID) => {
      const taskRef = doc(db, 'Task', taskID);
      const taskSnap = await getDoc(taskRef)

      if (!taskSnap.exists) return;

      const taskData = taskSnap.data();

      // Update Member and UnfinishedMember arrays
      await updateDoc(taskRef, {
        Member: arrayUnion(UserID),
        UnfinishedMember: arrayUnion(UserID),
      });

      const parentID = taskData.Parent;
      // Recursively update parent if it exists and is not "NULL"
      if (parentID && parentID !== "NULL") {
        await updateTaskAndAncestors(parentID);
      }
    };

    // Start from the given task
    await updateTaskAndAncestors(taskID);

    return res.status(200).json({
      success: true,
      message: `User ${UserID} added to Task ${taskID} and all ancestors.`,
    });
  } catch (error) {
    console.error('Error adding user to task:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});


// Scheduleing-related APIs

/**
 * @swagger
/**
 * @swagger
 * /users/{userID}/schedule:
 *   get:
 *     tags:
 *       - Scheduling
 *     summary: Schedule a user's tasks
 *     description: |
 *       Retrieves all leaf tasks assigned to a user and computes a task schedule using a selected algorithm.
 *       Algorithm options:
 *         - 1: Member-based (J sorting)
 *         - 2: Penalty-based (P sorting)
 *         - 3: Earliest Deadline First
 *         - 4: Highest Penalty First
 *         - 5: Shortest Expected Time First
 *     parameters:
 *       - in: path
 *         name: userID
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user whose tasks should be scheduled
 *       - in: query
 *         name: alg
 *         required: false
 *         schema:
 *           type: integer
 *           enum: [1, 2, 3, 4, 5]
 *           default: 1
 *         description: Algorithm ID to use for scheduling
 *     responses:
 *       200:
 *         description: Computed schedule
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 result:
 *                   type: array
 *                   description: Schedule result from Python script
 *                   items:
 *                     type: object
 *                     properties:
 *                       TaskID:
 *                         type: string
 *                         example: "abc123"
 *                       StartTime:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-06-01T12:00:00Z"
 *                       Duration:
 *                         type: number
 *                         example: 3600
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Failed to fetch leaf tasks"
 */
app.get('/users/:userID/schedule', async (req, res) => {
  try {
    const userID = req.params.userID;
    const alg = parseInt(req.query.alg) || 1; // Default to 1 
    //alg  scheduling 1:J人排序 2:P人排序
    //     基本排序    3:endTimes(作業截止時間越早越前面) 4:penalty(越重要越前面) 5:expectedtime(作業需要花費時間越短越前面)

    const q = query(
      collection(db, "Task"),
      where("UnfinishedMember", "array-contains", userID),
      where("State", "==", "On"),
    );

    const snapshot = await getDocs(q);
    const tasks = snapshot.docs;

    const filteredTasks = [];

    for (const taskDoc of tasks) {
      const data = taskDoc.data();
      const childIDs = data.Child || [];

      // ✅ child 為空或未定義，直接保留
      if (!childIDs || childIDs.length === 0) {
        filteredTasks.push({
          TaskID: data.TaskID,
          UserID: userID,
          Penalty: data.Penalty,
          ExpectedTime: data.ExpectedTime,
          EndTime: data.EndTime.toDate()
        });
        continue; // 跳過後面的 child 檢查
      }

      // 否則檢查 child 任務中是否包含該使用者
      const childDocs = await Promise.all(
        childIDs.map(id => getDoc(doc(db, "Task", id)))
      );

      const childHasUser = childDocs.some(childDoc => {
        const childData = childDoc.data();
        return childData?.Member?.includes(userID);
      });

      if (!childHasUser) {
        filteredTasks.push({
          TaskID: data.TaskID,
          UserID: userID,
          Penalty: data.Penalty,
          ExpectedTime: data.ExpectedTime,
          EndTime: data.EndTime.toDate()
        });
        console.log(`Task ${data.TaskID} has no children with user ${userID}, keeping it.`);
      }
    }

    if (filteredTasks.length === 0) {
      return res.json({ success: true, result: [] });
    }

    // Step 2: Process tasks to extract required fields
    const expectedTime = [];
    const penalty = [];
    const endTimes = [];
    const taskIDs = [];
    const now = new Date();

    for (const task of filteredTasks) {
      expectedTime.push(task.ExpectedTime || 3600); // Default to 3600 seconds
      penalty.push(task.Penalty || 0); // Default to 0 if not provided
      endTimes.push((new Date(task.EndTime).getTime() - now.getTime()) / 4000); // Convert to seconds 假設一天只有6小時可以完成作業
      taskIDs.push(task.TaskID);
    }

    // Step 3: Call /schedule/compute
    const computeResponse = await fetch('http://127.0.0.1:3000/schedule/compute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expectedTime,
        penalty,
        endTimes,
        taskIDs,
        alg,
      }),
    });

    if (!computeResponse.ok) {
      throw new Error(`Failed to compute schedule: ${computeResponse.status}`);
    }

    const computeData = await computeResponse.json();
    if (!computeData.success) {
      return res.status(500).json({ success: false, error: computeData.error || 'Failed to compute schedule' });
    }

    // Step 4: Return the result
    return res.json({ success: true, result: computeData.result });

  } catch (error) {
    console.error('Error scheduling tasks:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /schedule/compute:
 *   post:
 *     tags:
 *       - Scheduling
 *     summary: Run external Python-based scheduler
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               expectedTime:
 *                 type: array
 *                 items:
 *                   type: number
 *                 description: Array of expected times for tasks in minutes
 *                 example: [120, 60, 180]
 *               penalty:
 *                 type: array
 *                 items:
 *                   type: number
 *                 description: Array of penalty scores for tasks
 *                 example: [10, 5, 15]
 *               endTimes:
 *                 type: array
 *                 items:
 *                   type: number
 *                 description: Array of time until due in seconds
 *                 example: [86400, 172800, 259200]
 *               taskIDs:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of task IDs
 *                 example: ["Task A", "Task B", "Task C"]
 *               alg:
 *                 type: integer
 *                 description: Algorithm ID (e.g., 1 for GA, 2 for GA_2, etc.)
 *                 example: 1
 *             required:
 *               - expectedTime
 *               - penalty
 *               - endTimes
 *               - taskNames
 *               - alg
 *     responses:
 *       200:
 *         description: Computed schedule from Python
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 result:
 *                   type: array
 *                   items:
 *                     type: object
 *                   description: Schedule result from Python script
 *       400:
 *         description: Bad request - missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Missing required fields"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Invalid output from Python script"
 */
app.post('/schedule/compute', async (req, res) => {
  const { expectedTime, penalty, endTimes, taskIDs, alg } = req.body;

  if (!expectedTime || !penalty || !endTimes || !taskIDs || !alg) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  const input = JSON.stringify({
    expectedTime,
    penalty,
    endTimes,
    taskIDs,
    alg
  });
  const python = spawn("python", ["scheduling.py"]);

  let output = "";
  let errorOutput = "";

  python.stdout.on("data", (data) => {
    output += data.toString();
  });

  python.stderr.on("data", (data) => {
    errorOutput += data.toString();
  });

  python.stdin.write(input);
  python.stdin.end();

  python.on("close", (code) => {
    if (code !== 0) {
      console.error("Python script error:", errorOutput);
      return res.status(500).json({ success: false, error: errorOutput });
    }
    try {
      const parsed = JSON.parse(output);
      return res.status(200).json({ success: true, result: parsed });
    } catch (err) {
      console.error("無法解析 Python 輸出：", output);
      return res.status(500).json({ success: false, error: 'Invalid output from Python script' });
    }
  });
});


app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
// app.listen(3000, '0.0.0.0', () => {
//   console.log('🚀 Backend running on http://0.0.0.0:3000');
// });

const PORT = 3000;
const IP = getLocalIP();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend running at http://${IP}:${PORT}`);
  console.log(`📚 Swagger docs at http://${IP}:${PORT}/api-docs`);
});