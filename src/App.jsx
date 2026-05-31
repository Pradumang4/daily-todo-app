import { useEffect, useMemo, useState } from "react";
import {
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  doc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { auth, provider, db } from "./firebase";
import "./App.css";

const defaultFixedTasks = [];

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodoDocRef(uid) {
  return doc(db, "users", uid, "data", "todo");
}

function App() {
  const todayKey = getDateKey();

  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [syncLoading, setSyncLoading] = useState(true);

  const [fixedTasks, setFixedTasks] = useState(defaultFixedTasks);
  const [dailyTasks, setDailyTasks] = useState({});

  const [newTask, setNewTask] = useState("");
  const [newFixedTask, setNewFixedTask] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);

      if (!currentUser) {
        setSyncLoading(false);
        setFixedTasks(defaultFixedTasks);
        setDailyTasks({});
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    setSyncLoading(true);

    const todoRef = getTodoDocRef(user.uid);

    const unsubscribe = onSnapshot(
      todoRef,
      async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();

          setFixedTasks(
            Array.isArray(data.fixedTasks) && data.fixedTasks.length > 0
              ? data.fixedTasks
              : defaultFixedTasks
          );

          setDailyTasks(data.dailyTasks || {});
        } else {
          await setDoc(todoRef, {
            fixedTasks: defaultFixedTasks,
            dailyTasks: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }

        setSyncLoading(false);
      },
      (error) => {
        alert(error.message);
        setSyncLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  async function saveUserData(nextFixedTasks, nextDailyTasks) {
    if (!user) return;

    const todoRef = getTodoDocRef(user.uid);

    await setDoc(
      todoRef,
      {
        fixedTasks: nextFixedTasks,
        dailyTasks: nextDailyTasks,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }

  useEffect(() => {
    if (!user || syncLoading) return;

    const todayTasks = dailyTasks[todayKey] || [];

    const alreadyAddedFixedIds = new Set(
      todayTasks
        .filter((task) => task.type === "fixed")
        .map((task) => task.fixedId)
    );

    const missingFixedTasks = fixedTasks
      .filter((task) => !alreadyAddedFixedIds.has(task.id))
      .map((task) => ({
        id: crypto.randomUUID(),
        fixedId: task.id,
        text: task.text,
        completed: false,
        type: "fixed",
        createdAt: todayKey,
      }));

    if (missingFixedTasks.length === 0) return;

    const nextDailyTasks = {
      ...dailyTasks,
      [todayKey]: [...todayTasks, ...missingFixedTasks],
    };

    setDailyTasks(nextDailyTasks);
    saveUserData(fixedTasks, nextDailyTasks);
  }, [user, syncLoading, fixedTasks, dailyTasks, todayKey]);

  const todayTasks = dailyTasks[todayKey] || [];

  const pendingOldTasks = useMemo(() => {
    return Object.entries(dailyTasks)
      .filter(([date]) => date !== todayKey)
      .flatMap(([date, tasks]) =>
        tasks
          .filter((task) => !task.completed)
          .map((task) => ({ ...task, originalDate: date }))
      )
      .sort((a, b) => a.originalDate.localeCompare(b.originalDate));
  }, [dailyTasks, todayKey]);

  const completedCount = todayTasks.filter((task) => task.completed).length;
  const totalCount = todayTasks.length;

  async function loginWithGoogle() {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      alert(error.message);
    }
  }
  async function loginAsGuest() {
  try {
    await signInAnonymously(auth);
  } catch (error) {
    alert(error.message);
  }
}

  async function logoutUser() {
    await signOut(auth);
  }

  function addTodayTask() {
    const text = newTask.trim();
    if (!text) return;

    const task = {
      id: crypto.randomUUID(),
      text,
      completed: false,
      type: "custom",
      createdAt: todayKey,
    };

    const nextDailyTasks = {
      ...dailyTasks,
      [todayKey]: [...(dailyTasks[todayKey] || []), task],
    };

    setDailyTasks(nextDailyTasks);
    saveUserData(fixedTasks, nextDailyTasks);
    setNewTask("");
  }

  function addFixedTask() {
    const text = newFixedTask.trim();
    if (!text) return;

    const nextFixedTasks = [
      ...fixedTasks,
      { id: crypto.randomUUID(), text },
    ];

    setFixedTasks(nextFixedTasks);
    saveUserData(nextFixedTasks, dailyTasks);
    setNewFixedTask("");
  }

  function toggleTask(date, taskId) {
    const nextDailyTasks = {
      ...dailyTasks,
      [date]: dailyTasks[date].map((task) =>
        task.id === taskId
          ? { ...task, completed: !task.completed }
          : task
      ),
    };

    setDailyTasks(nextDailyTasks);
    saveUserData(fixedTasks, nextDailyTasks);
  }

  function deleteTask(date, taskId) {
    const nextDailyTasks = {
      ...dailyTasks,
      [date]: dailyTasks[date].filter((task) => task.id !== taskId),
    };

    setDailyTasks(nextDailyTasks);
    saveUserData(fixedTasks, nextDailyTasks);
  }

  function deleteFixedTask(fixedId) {
    const nextFixedTasks = fixedTasks.filter((task) => task.id !== fixedId);

    const nextDailyTasks = {
      ...dailyTasks,
      [todayKey]: (dailyTasks[todayKey] || []).filter(
        (task) => task.fixedId !== fixedId
      ),
    };

    setFixedTasks(nextFixedTasks);
    setDailyTasks(nextDailyTasks);
    saveUserData(nextFixedTasks, nextDailyTasks);
  }

  if (authLoading) {
    return (
      <main className="app">
        <section className="card centerCard">
          <p>Loading...</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="app">
        <section className="card centerCard">
          <p className="eyebrow">Daily To-Do</p>
          <h1>Login to continue</h1>
          <p className="hint">
            Phone aur PC sync ke liye Google login use karenge.
          </p>

          <button className="loginBtn" onClick={loginWithGoogle}>
            Continue with Google
          </button>
          <button onClick={loginAsGuest} className="guest-btn">
          Continue without login
          </button>

        </section>
      </main>
    );
  }

  if (syncLoading) {
    return (
      <main className="app">
        <section className="card centerCard">
          <p>Syncing your tasks...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <section className="card">
        <div className="userBar">
          <div>
            <strong>{user.displayName || "User"}</strong>
            <p>{user.email}</p>
          </div>

          <button onClick={logoutUser}>Logout</button>
        </div>

        <div className="top">
          <div>
            <div className="app-header">
  <div>
    <h1>Daily Todo</h1>
    <p>Plan your day. Stay consistent.</p>
  </div>
</div>
            <p className="date">{todayKey}</p>
          </div>

          <div className="score">
            <strong>{completedCount}</strong>
            <span>/ {totalCount}</span>
          </div>
        </div>

        <div className="inputRow">
          <input
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTodayTask()}
            placeholder="Aaj ka task likho..."
          />
          <button onClick={addTodayTask}>Add</button>
        </div>

        <div className="sectionTitle">Aaj ke tasks</div>

        {todayTasks.length === 0 ? (
          <p className="empty">Aaj ke liye koi task nahi hai.</p>
        ) : (
          <div className="list">
            {todayTasks.map((task) => (
              <div className="task" key={task.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => toggleTask(todayKey, task.id)}
                  />
                  <span className={task.completed ? "done" : ""}>
                    {task.text}
                  </span>
                </label>

                <button
                  className="delete"
                  onClick={() => deleteTask(todayKey, task.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {pendingOldTasks.length > 0 && (
          <>
            <div className="sectionTitle">Purane pending tasks</div>

            <div className="list">
              {pendingOldTasks.map((task) => (
                <div
                  className="task old"
                  key={`${task.originalDate}-${task.id}`}
                >
                  <label>
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() =>
                        toggleTask(task.originalDate, task.id)
                      }
                    />
                    <span>{task.text}</span>
                  </label>

                  <small>{task.originalDate}</small>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="card smallCard">
        <h2>Fixed Daily Tasks</h2>
        <p className="hint">Ye tasks roz automatically aa jayenge.</p>

        <div className="inputRow">
          <input
            value={newFixedTask}
            onChange={(e) => setNewFixedTask(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addFixedTask()}
            placeholder="Daily fixed task add karo..."
          />
          <button onClick={addFixedTask}>Add</button>
        </div>

        <div className="fixedList">
          {fixedTasks.map((task) => (
            <div className="fixedTask" key={task.id}>
              <span>{task.text}</span>
              <button onClick={() => deleteFixedTask(task.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;