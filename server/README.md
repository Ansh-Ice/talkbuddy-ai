# TalkBuddy AI Backend Server

This is the FastAPI backend server for TalkBuddy AI that handles email sending functionality.

## Setup Instructions

### 1. Install Dependencies

```bash
cd server
pip install -r requirements.txt
```

### 2. Email Configuration

Create a `.env` file in the server directory with your email credentials:

```env
EMAIL_ADDRESS=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
```

**For Gmail users:**
1. Enable 2-factor authentication on your Google account
2. Generate an "App Password" for this application
3. Use the app password (not your regular password) in EMAIL_PASSWORD

### 3. Run the Server

```bash
python main.py
```

The server will start on `http://localhost:8000`

## API Endpoints

### POST /send-deletion-email
Sends account deletion confirmation email.

**Request Body:**
```json
{
  "userId": "string",
  "email": "string", 
  "displayName": "string",
  "deletionToken": "string",
  "confirmationUrl": "string"
}
```

### POST /send-password-reset
Sends password reset email.

**Request Body:**
```json
{
  "email": "string"
}
```

## Features

- ✅ SMTP email sending
- ✅ HTML email templates
- ✅ CORS support for frontend
- ✅ Error handling
- ✅ Professional email design
