import { signOut } from "firebase/auth";
import { auth } from "./firebase";

export default function Dashboard({ user }) {
  const handleLogout = async () => {
    await signOut(auth);
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <button className="secondary" onClick={handleLogout}>Logout</button>
      </div>
      <div className="card">
        <p>Welcome, {user.email} 🎉</p>
        <p>We’ll soon add your learning stats and upcoming lessons here.</p>
      </div>
    </div>
  );
}
