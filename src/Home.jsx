import { Link } from "react-router-dom";

export default function Home({ user }) {
  return (
    <div className="home">
      <div className="hero">
        <h1>Welcome to TalkBuddy 🗣️</h1>
        <p>Practice speaking, learn faster, and build confidence.</p>
        {user ? (
          <Link className="primary" to="/dashboard">Open Dashboard</Link>
        ) : (
          <Link className="primary" to="/auth">Get Started</Link>
        )}
      </div>
      <div className="features">
        <div className="feature">Live conversation practice</div>
        <div className="feature">Personalized lessons</div>
        <div className="feature">Instant feedback</div>
      </div>
    </div>
  );
}
