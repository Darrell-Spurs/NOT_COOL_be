import cron from 'node-cron';
import { db } from "./firebaseConfig.js";
import { collection, getDocs } from 'firebase/firestore';

export function runDueChecker() {
  async function getEndTimesGrouped(dueWindows = [3600]) {
    const tasksCol = collection(db, 'Task');
    const taskSnapshot = await getDocs(tasksCol);
    const currentTime = Math.floor(Date.now() / 1000);

    const tasks = taskSnapshot.docs.map(doc => {
      const data = doc.data();
      const endTimeSec = data.EndTime?.seconds || Math.floor(data.EndTime / 1000);
      const untilDue = endTimeSec - currentTime;

      return {
        ...data,
        UntilDue: untilDue
      };
    });

    // Sort dueWindows to make bucket checks cleaner
    const sortedWindows = [...dueWindows].sort((a, b) => a - b);

    // Initialize result object
    const result = {};
    for (const w of sortedWindows) result[w] = [];

    for (const task of tasks) {
      if (task.UntilDue <= 0) continue;

      for (let i = 0; i < sortedWindows.length; i++) {
        const lower = i === 0 ? 0 : sortedWindows[i - 1];
        const upper = sortedWindows[i];

        if (task.UntilDue > lower && task.UntilDue <= upper) {
          result[upper].push(task);
          break;
        }
      }
    }

    return result;
  }

  getEndTimesGrouped();

  // Run every minute
cron.schedule('* * * * *', async () => {
  console.log('Checking for grouped due tasks...');
  const dueWindows = [3600, 86400, 86400 * 2]; 
  const groupedTasks = await getEndTimesGrouped(dueWindows);

  for (const [window, tasks] of Object.entries(groupedTasks)) {
    for (const task of tasks) {

      // TODO: Save TOKEN
      const token = await getUserTokenByUserID(task.UserID); 
      if (!token) continue;

      const payload = {
        token: token,
        until_due: window,
        task_name: task.TaskName,
      };

      try {
        const response = await fetch('http://localhost:3000/due-notification', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const result = await response.json();
        console.log('✅ Notification sent:', result);
      } catch (error) {
        console.error('❌ Failed to send /due-notification:', error);
      }
    }
  }
}