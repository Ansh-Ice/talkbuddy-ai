from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from datetime import datetime
import uvicorn

# Create FastAPI instance
app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # Add your frontend URLs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Email configuration
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
EMAIL_ADDRESS = os.getenv("EMAIL_ADDRESS", "your-email@gmail.com")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD", "your-app-password")

class DeletionRequest(BaseModel):
    userId: str
    email: str
    displayName: str
    deletionToken: str
    confirmationUrl: str

class PasswordResetRequest(BaseModel):
    email: str

def send_email(to_email: str, subject: str, html_content: str):
    """Send email using SMTP"""
    try:
        # Create message
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = EMAIL_ADDRESS
        msg['To'] = to_email

        # Create HTML part
        html_part = MIMEText(html_content, 'html')
        msg.attach(html_part)

        # Send email
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
        text = msg.as_string()
        server.sendmail(EMAIL_ADDRESS, to_email, text)
        server.quit()
        
        return True
    except Exception as e:
        print(f"Error sending email: {e}")
        return False

@app.get("/")
def root():
    return {"message": "Hello from FastAPI 🚀"}

@app.post("/send-deletion-email")
async def send_deletion_email(request: DeletionRequest):
    """Send account deletion confirmation email"""
    try:
        subject = "Confirm Account Deletion - TalkBuddy AI"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Account Deletion Confirmation</title>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #8b5cf6, #a78bfa); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }}
                .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
                .warning {{ background: #fee2e2; border: 1px solid #fca5a5; color: #dc2626; padding: 15px; border-radius: 8px; margin: 20px 0; }}
                .button {{ display: inline-block; background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }}
                .button:hover {{ background: #b91c1c; }}
                .footer {{ text-align: center; margin-top: 30px; color: #666; font-size: 14px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🗣️ TalkBuddy AI</h1>
                    <p>Account Deletion Confirmation</p>
                </div>
                <div class="content">
                    <h2>Hello {request.displayName},</h2>
                    <p>You have requested to delete your TalkBuddy AI account. This action will permanently remove all your data including:</p>
                    <ul>
                        <li>Your profile information</li>
                        <li>All chat history and conversations</li>
                        <li>Your learning progress and statistics</li>
                        <li>All associated data</li>
                    </ul>
                    
                    <div class="warning">
                        <strong>⚠️ Warning:</strong> This action cannot be undone. Once you confirm the deletion, all your data will be permanently removed.
                    </div>
                    
                    <p>If you want to proceed with deleting your account, click the button below:</p>
                    
                    <a href="{request.confirmationUrl}" class="button">Confirm Account Deletion</a>
                    
                    <p>If you did not request this deletion, please ignore this email. Your account will remain active.</p>
                    
                    <p><strong>Note:</strong> This confirmation link will expire in 24 hours for security reasons.</p>
                </div>
                <div class="footer">
                    <p>© {datetime.now().year} TalkBuddy AI. All rights reserved.</p>
                    <p>This is an automated message. Please do not reply to this email.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        success = send_email(request.email, subject, html_content)
        
        if success:
            return {"message": "Deletion confirmation email sent successfully", "status": "success"}
        else:
            raise HTTPException(status_code=500, detail="Failed to send email")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error sending deletion email: {str(e)}")

@app.post("/send-password-reset")
async def send_password_reset(request: PasswordResetRequest):
    """Send password reset email"""
    try:
        subject = "Password Reset - TalkBuddy AI"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Password Reset</title>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #8b5cf6, #a78bfa); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }}
                .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
                .button {{ display: inline-block; background: #8b5cf6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }}
                .button:hover {{ background: #7c3aed; }}
                .footer {{ text-align: center; margin-top: 30px; color: #666; font-size: 14px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🗣️ TalkBuddy AI</h1>
                    <p>Password Reset Request</p>
                </div>
                <div class="content">
                    <h2>Password Reset Request</h2>
                    <p>You have requested to change your password for your TalkBuddy AI account.</p>
                    <p>To reset your password, please use the password reset feature in your account settings or contact support.</p>
                    <p>If you did not request this password change, please ignore this email and consider changing your password for security.</p>
                </div>
                <div class="footer">
                    <p>© {datetime.now().year} TalkBuddy AI. All rights reserved.</p>
                    <p>This is an automated message. Please do not reply to this email.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        success = send_email(request.email, subject, html_content)
        
        if success:
            return {"message": "Password reset email sent successfully", "status": "success"}
        else:
            raise HTTPException(status_code=500, detail="Failed to send email")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error sending password reset email: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
