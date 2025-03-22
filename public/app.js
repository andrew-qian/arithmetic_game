import firebaseConfig from './config.js';

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// Game state variables
let currentUser = null;
let currentScore = 0;
let timeLeft = 120; // seconds
let timer = null;
let currentProblem = null;

// DOM elements for pages
const pages = {
  signIn: document.getElementById('sign-in-page'),
  createAccount: document.getElementById('create-account-page'),
  menu: document.getElementById('menu-page'),
  game: document.getElementById('game-page'),
  gameOver: document.getElementById('game-over-page'),
  leaderboard: document.getElementById('leaderboard-page'),
  stats: document.getElementById('stats-page')
};

// Helper function to show one page and hide the others
function showPage(pageId) {
  Object.values(pages).forEach(page => page.classList.add('hidden'));
  document.getElementById(pageId).classList.remove('hidden');
  
  if (pageId === 'game-page') {
    document.getElementById('answer-input').focus();
  }
}

// Initialize event listeners
function initializeEventListeners() {
  // Sign In Page
  document.getElementById('sign-in-button').addEventListener('click', handleSignIn);
  document.getElementById('create-account-button').addEventListener('click', () => showPage('create-account-page'));
  
  // Create Account Page
  document.getElementById('submit-account-button').addEventListener('click', handleCreateAccount);
  document.getElementById('back-to-signin-button').addEventListener('click', () => showPage('sign-in-page'));
  
  // Menu Page
  document.getElementById('start-game-button').addEventListener('click', startGame);
  document.getElementById('view-leaderboard-button').addEventListener('click', () => {
    populateLeaderboard();
    showPage('leaderboard-page');
  });
  document.getElementById('view-stats-button').addEventListener('click', () => {
    populateUserStats();
    showPage('stats-page');
  });
  document.getElementById('sign-out-button').addEventListener('click', handleSignOut);
  
  // Game Page: Check answer input
  document.getElementById('answer-input').addEventListener('input', function() {
    const userInput = this.value.trim();
    if (userInput.length > 0) {
      const userAnswer = parseInt(userInput);
      if (!isNaN(userAnswer) && userAnswer === currentProblem.answer) {
        // Correct answer
        currentScore++;
        document.getElementById('current-score').textContent = currentScore;
        
        // Update user stats in the database
        const userStatsRef = db.ref('users/' + currentUser.uid + '/stats');
        userStatsRef.once('value').then(snapshot => {
          let stats = snapshot.val() || { totalProblems: 0, correctAnswers: 0 };
          stats.totalProblems++;
          stats.correctAnswers++;
          userStatsRef.set(stats);
        });
        
        // Clear input and generate new problem
        this.value = '';
        generateProblem();
      }
    }
  });
  
  // Game Over Page
  document.getElementById('play-again-button').addEventListener('click', startGame);
  document.getElementById('back-to-menu-button').addEventListener('click', () => showPage('menu-page'));
  
  // Leaderboard Page
  document.getElementById('leaderboard-back-button').addEventListener('click', () => showPage('menu-page'));
  
  // Stats Page
  document.getElementById('stats-back-button').addEventListener('click', () => showPage('menu-page'));
}

// Authentication functions using Firebase Auth
function handleSignIn() {
  const email = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errorElement = document.getElementById('sign-in-error');
  
  if (!email || !password) {
    errorElement.textContent = "Please enter both email and password";
    errorElement.classList.remove('hidden');
    return;
  }
  
  auth.signInWithEmailAndPassword(email, password)
    .then(userCredential => {
      currentUser = userCredential.user;
      // Retrieve the username from the database
      db.ref('users/' + currentUser.uid + '/username').once('value').then(snapshot => {
        document.getElementById('user-welcome').textContent = snapshot.val() || currentUser.email;
      });
      errorElement.classList.add('hidden');
      document.getElementById('username').value = '';
      document.getElementById('password').value = '';
      showPage('menu-page');
    })
    .catch(error => {
      errorElement.textContent = error.message;
      errorElement.classList.remove('hidden');
    });
}

function handleCreateAccount() {
  const username = document.getElementById('username-input').value.trim();
  const email = document.getElementById('new-email').value.trim();
  const password = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;
  const errorElement = document.getElementById('create-account-error');
  
  if (!username || !email || !password) {
    errorElement.textContent = "Please enter username, email and password";
    errorElement.classList.remove('hidden');
    return;
  }
  
  if (password !== confirmPassword) {
    errorElement.textContent = "Passwords do not match";
    errorElement.classList.remove('hidden');
    return;
  }
  
  auth.createUserWithEmailAndPassword(email, password)
    .then(userCredential => {
      currentUser = userCredential.user;
      document.getElementById('user-welcome').textContent = username;
      errorElement.classList.add('hidden');
      // Clear the input fields
      document.getElementById('username-input').value = '';
      document.getElementById('new-email').value = '';
      document.getElementById('new-password').value = '';
      document.getElementById('confirm-password').value = '';
      
      // Initialize user stats and store the username in the database
      db.ref('users/' + currentUser.uid).set({
        email: currentUser.email,
        username: username,
        stats: { totalProblems: 0, correctAnswers: 0 },
        scores: {}
      });
      
      showPage('menu-page');
    })
    .catch(error => {
      errorElement.textContent = error.message;
      errorElement.classList.remove('hidden');
    });
}

function handleSignOut() {
  auth.signOut().then(() => {
    currentUser = null;
    showPage('sign-in-page');
  });
}

// Listen for auth state changes
auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    db.ref('users/' + currentUser.uid + '/username').once('value').then(snapshot => {
      document.getElementById('user-welcome').textContent = snapshot.val() || currentUser.email;
    });
    showPage('menu-page');
  } else {
    currentUser = null;
    showPage('sign-in-page');
  }
});

// Game functions
function startGame() {
  currentScore = 0;
  timeLeft = 120;
  document.getElementById('current-score').textContent = currentScore;
  document.getElementById('timer').textContent = timeLeft;
  document.getElementById('answer-input').value = '';
  
  generateProblem();
  
  if (timer) clearInterval(timer);
  timer = setInterval(updateTimer, 1000);
  
  showPage('game-page');
  document.getElementById('answer-input').focus();
}

function updateTimer() {
  timeLeft--;
  document.getElementById('timer').textContent = timeLeft;
  if (timeLeft <= 0) {
    endGame();
  }
}

function generateProblem() {
  const problemTypes = ['addition', 'subtraction', 'multiplication', 'division'];
  const type = problemTypes[Math.floor(Math.random() * problemTypes.length)];
  let num1, num2, answer, problemText;
  
  switch (type) {
    case 'addition':
      num1 = Math.floor(Math.random() * 99) + 2;
      num2 = Math.floor(Math.random() * 99) + 2;
      answer = num1 + num2;
      problemText = `${num1} + ${num2} =`;
      break;
    case 'subtraction':
      num1 = Math.floor(Math.random() * 99) + 2;
      num2 = Math.floor(Math.random() * 99) + 2;
      if (num1 < num2) [num1, num2] = [num2, num1];
      answer = num1 - num2;
      problemText = `${num1} - ${num2} =`;
      break;
    case 'multiplication':
      num1 = Math.floor(Math.random() * 11) + 2;
      num2 = Math.floor(Math.random() * 99) + 2;
      answer = num1 * num2;
      problemText = `${num1} × ${num2} =`;
      break;
    case 'division':
      num2 = Math.floor(Math.random() * 11) + 2;
      answer = Math.floor(Math.random() * 99) + 2;
      num1 = num2 * answer;
      problemText = `${num1} ÷ ${num2} =`;
      break;
  }
  
  currentProblem = { text: problemText, answer: answer, type: type };
  document.getElementById('problem-text').textContent = problemText;
}

function endGame() {
  clearInterval(timer);
  
  const date = new Date().toLocaleDateString();
  
  // Save the game score to the user's scores in the database
  const scoreRef = db.ref('users/' + currentUser.uid + '/scores').push();
  scoreRef.set({ score: currentScore, date: date });
  
  // Also add to a global leaderboard node, including the username
  const leaderboardRef = db.ref('leaderboard').push();
  leaderboardRef.set({ uid: currentUser.uid, username: document.getElementById('user-welcome').textContent, score: currentScore, date: date });
  
  // Update game over page with final score and history
  document.getElementById('final-score').textContent = currentScore;
  populateUserHistory();
  populateMiniLeaderboard();
  showPage('game-over-page');
}

// Populate user history from Firebase
function populateUserHistory() {
  const historyContainer = document.getElementById('user-history');
  historyContainer.innerHTML = '';
  
  db.ref('users/' + currentUser.uid + '/scores').orderByKey().limitToLast(5).once('value', snapshot => {
    const scores = snapshot.val();
    if (!scores) {
      historyContainer.innerHTML = '<p>No previous games</p>';
      return;
    }
    const scoresArray = Object.values(scores).reverse();
    let table = '<table class="leaderboard"><thead><tr><th>Game</th><th>Score</th><th>Date</th></tr></thead><tbody>';
    scoresArray.forEach((score, index) => {
      table += `<tr><td>${index + 1}</td><td>${score.score}</td><td>${score.date}</td></tr>`;
    });
    table += '</tbody></table>';
    historyContainer.innerHTML = table;
  });
}

// Populate mini leaderboard (top 5)
function populateMiniLeaderboard() {
  const leaderboardBody = document.getElementById('mini-leaderboard-body');
  leaderboardBody.innerHTML = '';
  
  db.ref('leaderboard').orderByChild('score').limitToLast(5).once('value', snapshot => {
    let entries = [];
    snapshot.forEach(childSnapshot => {
      entries.push(childSnapshot.val());
    });
    // Sort highest scores first
    entries.sort((a, b) => b.score - a.score);
    entries.forEach((entry, index) => {
      leaderboardBody.innerHTML += `
        <tr>
          <td>${index + 1}</td>
          <td>${entry.username}</td>
          <td>${entry.score}</td>
          <td>${entry.date}</td>
        </tr>
      `;
    });
  });
}

// Populate full leaderboard
function populateLeaderboard() {
  const leaderboardBody = document.getElementById('full-leaderboard-body');
  leaderboardBody.innerHTML = '';
  
  db.ref('leaderboard').orderByChild('score').once('value', snapshot => {
    let entries = [];
    snapshot.forEach(childSnapshot => {
      entries.push(childSnapshot.val());
    });
    // Sort in descending order
    entries.sort((a, b) => b.score - a.score);
    entries.forEach((entry, index) => {
      leaderboardBody.innerHTML += `
        <tr>
          <td>${index + 1}</td>
          <td>${entry.username}</td>
          <td>${entry.score}</td>
          <td>${entry.date}</td>
        </tr>
      `;
    });
  });
}

// Populate user stats from Firebase
function populateUserStats() {
  const statsContainer = document.getElementById('detailed-stats');
  statsContainer.innerHTML = '<p>Loading...</p>';
  
  db.ref('users/' + currentUser.uid).once('value', snapshot => {
    const userData = snapshot.val();
    if (!userData) {
      statsContainer.innerHTML = '<p>No user data found.</p>';
      return;
    }
    const scoresObj = userData.scores || {};
    const scoresArray = Object.values(scoresObj);
    let bestScore = 0, totalScore = 0;
    scoresArray.forEach(s => {
      bestScore = Math.max(bestScore, s.score);
      totalScore += s.score;
    });
    const averageScore = scoresArray.length ? (totalScore / scoresArray.length).toFixed(1) : 0;
    const totalProblems = userData.stats ? userData.stats.totalProblems : 0;
    const correctAnswers = userData.stats ? userData.stats.correctAnswers : 0;
    const accuracy = totalProblems ? ((correctAnswers / totalProblems) * 100).toFixed(1) : 0;
    
    let html = `
      <h3>Summary</h3>
      <p>Games Played: ${scoresArray.length}</p>
      <p>Best Score: ${bestScore}</p>
      <p>Average Score: ${averageScore}</p>
      <p>Total Problems Attempted: ${totalProblems}</p>
      <p>Correct Answers: ${correctAnswers}</p>
      <p>Accuracy: ${accuracy}%</p>
      <h3>Recent Games</h3>
    `;
    
    if (scoresArray.length === 0) {
      html += '<p>No games played yet</p>';
      statsContainer.innerHTML = html;
      return;
    }
    
    html += '<table class="leaderboard"><thead><tr><th>Game</th><th>Score</th><th>Date</th></tr></thead><tbody>';
    scoresArray.reverse().slice(0, 10).forEach((score, index) => {
      html += `<tr><td>${index + 1}</td><td>${score.score}</td><td>${score.date}</td></tr>`;
    });
    html += '</tbody></table>';
    statsContainer.innerHTML = html;
  });
}


document.addEventListener('DOMContentLoaded', () => {
  initializeEventListeners();
  showPage('sign-in-page');
});
