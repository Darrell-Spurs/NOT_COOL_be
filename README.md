# 📋 To-Do List App (Backend)

## 📝 Description

This is the **backend API server** for the To-Do List mobile app. It provides **RESTful API** endpoints for user authentication, task & meeting management, scheduling and push notifications. It is built using **Node.js** and **Express**, and integrates with **Firebase** for authentication and data storage. It also serves a **cron scheduler** that checks if there are notifications that needs to be sent regularly. 

---

## 🚀 Features

- Serves API for authencation, managing tasks, meetings and scheduling.
- Interactive API documentation with Swagger (OpenAPI Spec)
- Push notification scheduler for due tasks
---

## 🧱 Tech Stack

- Node.js + Express
- Firebase Firestore 
- Firebase Authentication
- node-cron 
- Swagger

---

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Darrell-Spurs/NOT_COOL_be
   cd NOT_COOL_be
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run the backend server**
To run the backend, execute the command:
   ```bash
   node index.js
   ```
    To auto-update after any changes and debug, execute: 
   ```bash
   nodemon index.js
   ```

4. **View the API Documentation**
To view the Swagger file, please run:
   ```bash
   localhost:3000/api-docs
   ```
    or click the link after running the backend.

---

## 📁 Project Structure
```
NOT_COOL_be/
├── duetime_checker.js      # 定時排程檢查器，會定期檢查即將到期的任務並觸發通知
├── firebaseConfig.js       # Firebase 設定檔，用來初始化Firestore與Auth服務
├── index.js                # 主要的伺服器進入點，包含 Express API 設定與路由定義
├── nodemon.json            # Nodemon 設定檔，用於開發時自動重啟伺服器
├── package.json            # 專案依賴和腳本
├── package-lock.json       # 套件鎖定檔，確保所有開發者使用相同版本的套件
├── README.md               # 專案說明文件（本文件）
├── scheduling.py           # 排程演算法（如任務排序），以 Python 撰寫供後端呼叫
└── swagger.js              # Swagger (OpenAPI) 文件設定，用於產生互動式 API 文件

```