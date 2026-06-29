/**
 * Reusable quiz module for Algo Infinity Verse
 */

// --- QUIZ TIMER STATE ---
let timerInterval = null;
let timeLeft = 0;
let isTimerRunning = false;
let quizDuration = 60; // Default duration in seconds

export function initQuiz({ containerId, questions, duration = 60 }) {
  const container = document.getElementById(containerId);
  if (!container || !questions || questions.length === 0) return;

  let currentQuestions = [];
  let hasSubmitted = false;
  quizDuration = duration;

  // Helper to shuffle an array (Fisher-Yates)
  function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // --- TIMER FUNCTIONS ---
  function startQuizTimer(onComplete) {
    // Clear any existing timer
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    
    timeLeft = quizDuration;
    isTimerRunning = true;
    updateTimerDisplay(timeLeft);
    
    timerInterval = setInterval(() => {
      timeLeft--;
      
      // CRITICAL FIX: Stop at 0, don't go negative
      if (timeLeft <= 0) {
        timeLeft = 0;
        updateTimerDisplay(timeLeft);
        stopQuizTimer();
        
        // Show "Time's Up!" message
        const timerDisplay = document.querySelector('.quiz-timer-display');
        if (timerDisplay) {
          timerDisplay.textContent = '⏰ Time\'s Up!';
          timerDisplay.classList.add('times-up');
        }
        
        // Auto-submit quiz
        if (typeof onComplete === 'function') {
          onComplete();
        }
        return;
      }
      
      updateTimerDisplay(timeLeft);
    }, 1000);
  }

  function stopQuizTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    isTimerRunning = false;
  }

  function updateTimerDisplay(seconds) {
    const timerDisplay = document.querySelector('.quiz-timer-display');
    if (!timerDisplay) return;
    
    // Format as MM:SS if needed
    if (seconds > 60) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      timerDisplay.textContent = `⏱️ ${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    } else {
      timerDisplay.textContent = `⏱️ ${seconds}s`;
    }
    
    // Visual warnings for low time
    timerDisplay.classList.remove('time-warning', 'time-critical');
    if (seconds <= 10 && seconds > 0) {
      timerDisplay.classList.add('time-critical');
    } else if (seconds <= 30) {
      timerDisplay.classList.add('time-warning');
    }
  }

  function resetQuizTimer() {
    stopQuizTimer();
    const timerDisplay = document.querySelector('.quiz-timer-display');
    if (timerDisplay) {
      timerDisplay.textContent = `⏱️ ${quizDuration}s`;
      timerDisplay.classList.remove('times-up', 'time-warning', 'time-critical');
    }
    timeLeft = quizDuration;
    isTimerRunning = false;
  }

  // Initialize and shuffle quiz data
  function setupQuiz() {
    hasSubmitted = false;
    resetQuizTimer();
    currentQuestions = shuffleArray(questions).map(q => {
      return {
        ...q,
        shuffledOptions: shuffleArray(q.options)
      };
    });
    renderQuiz();
  }

  // Render the quiz UI
  function renderQuiz() {
    container.innerHTML = '';
    
    // --- Timer Display ---
    const timerContainer = document.createElement('div');
    timerContainer.className = 'quiz-timer-container';
    timerContainer.innerHTML = `
      <div class="quiz-timer-wrapper">
        <span class="quiz-timer-label"><i class="fas fa-clock"></i> Time Remaining:</span>
        <span class="quiz-timer-display">⏱️ ${quizDuration}s</span>
      </div>
    `;
    container.appendChild(timerContainer);
    
    const quizForm = document.createElement('form');
    quizForm.className = 'quiz-form';
    quizForm.id = `${containerId}-form`;
    
    currentQuestions.forEach((q, index) => {
      const questionBlock = document.createElement('div');
      questionBlock.className = 'quiz-question-block glass-card';
      questionBlock.id = `question-block-${index}`;
      
      const questionTitle = document.createElement('h4');
      questionTitle.className = 'quiz-question-title';
      questionTitle.innerHTML = `<span class="question-number">${index + 1}.</span> ${q.question}`;
      questionBlock.appendChild(questionTitle);
      
      const optionsList = document.createElement('div');
      optionsList.className = 'quiz-options';
      
      q.shuffledOptions.forEach((option, optIndex) => {
        const optionLabel = document.createElement('label');
        optionLabel.className = 'quiz-option-label';
        
        const optionInput = document.createElement('input');
        optionInput.type = 'radio';
        optionInput.name = `question-${index}`;
        optionInput.value = option;
        
        const optionText = document.createElement('span');
        optionText.className = 'quiz-option-text';
        optionText.textContent = option;
        
        optionLabel.appendChild(optionInput);
        optionLabel.appendChild(optionText);
        optionsList.appendChild(optionLabel);
      });
      
      questionBlock.appendChild(optionsList);
      
      // Feedback container (hidden initially)
      const feedbackDiv = document.createElement('div');
      feedbackDiv.className = 'quiz-feedback';
      feedbackDiv.id = `feedback-${index}`;
      feedbackDiv.style.display = 'none';
      questionBlock.appendChild(feedbackDiv);
      
      quizForm.appendChild(questionBlock);
    });
    
    // Actions container
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'quiz-actions';
    
    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'btn btn-primary submit-quiz-btn';
    submitBtn.textContent = 'Submit Quiz';
    submitBtn.addEventListener('click', handleSubmit);
    
    actionsDiv.appendChild(submitBtn);
    quizForm.appendChild(actionsDiv);
    
    // Score container (hidden initially)
    const scoreDiv = document.createElement('div');
    scoreDiv.className = 'quiz-score-container glass-card';
    scoreDiv.id = `${containerId}-score`;
    scoreDiv.style.display = 'none';
    
    container.appendChild(quizForm);
    container.appendChild(scoreDiv);

    // --- Start the timer ---
    startQuizTimer(() => {
      // Auto-submit when time runs out
      if (!hasSubmitted) {
        handleSubmit();
      }
    });
  }

  // Handle quiz submission
  function handleSubmit() {
    if (hasSubmitted) return;
    hasSubmitted = true;
    
    // Stop the timer
    stopQuizTimer();
    
    const form = document.getElementById(`${containerId}-form`);
    let score = 0;
    
    currentQuestions.forEach((q, index) => {
      const selectedInput = form.querySelector(`input[name="question-${index}"]:checked`);
      const selectedValue = selectedInput ? selectedInput.value : null;
      
      const isCorrect = selectedValue === q.answer;
      if (isCorrect) score++;
      
      // Highlight options
      const labels = form.querySelectorAll(`input[name="question-${index}"]`);
      labels.forEach(input => {
        input.disabled = true; // Lock inputs
        const label = input.parentElement;
        if (input.value === q.answer) {
          label.classList.add('correct');
        } else if (input.checked && !isCorrect) {
          label.classList.add('incorrect');
        }
      });
      
      // Show feedback
      const feedbackDiv = document.getElementById(`feedback-${index}`);
      feedbackDiv.style.display = 'block';
      if (isCorrect) {
        feedbackDiv.innerHTML = `<p class="feedback-correct"><i class="fas fa-check-circle"></i> Correct! ${q.explanation || ''}</p>`;
      } else {
        feedbackDiv.innerHTML = `<p class="feedback-incorrect"><i class="fas fa-times-circle"></i> Incorrect. ${q.explanation || ''}</p>`;
      }
    });
    
    // Hide submit button
    const submitBtn = form.querySelector('.submit-quiz-btn');
    if (submitBtn) submitBtn.style.display = 'none';
    
    // Show score
    const scoreDiv = document.getElementById(`${containerId}-score`);
    scoreDiv.style.display = 'block';
    
    const pct = Math.round((score / currentQuestions.length) * 100);
    let message = '';
    let emoji = '';
    if (pct === 100) {
      message = 'Perfect score! Outstanding! 🏆';
      emoji = '🎉';
    } else if (pct >= 80) {
      message = 'Excellent! You have a great understanding! 🌟';
      emoji = '💪';
    } else if (pct >= 70) {
      message = 'Great job! You have a solid understanding! 📚';
      emoji = '📖';
    } else if (pct >= 50) {
      message = 'Good effort! Review the concepts and try again! 🎯';
      emoji = '🔄';
    } else {
      message = 'Keep learning! Review the material and try again! 💪';
      emoji = '📝';
    }
    
    // Check if time ran out
    const timeRanOut = timeLeft === 0;
    const timeMessage = timeRanOut ? '⏰ Time ran out! ' : '';
    
    scoreDiv.innerHTML = `
      <div class="score-header">
        <h3>${timeMessage}Quiz Results</h3>
        <div class="score-circle ${pct >= 70 ? 'good' : 'needs-work'}">
          <span class="score-number">${score}/${currentQuestions.length}</span>
        </div>
      </div>
      <div class="score-percentage">
        <span class="percentage-number">${pct}%</span>
        <span class="percentage-label">Score</span>
      </div>
      <p class="score-message">${emoji} ${message}</p>
      <button class="btn btn-secondary retake-quiz-btn" id="${containerId}-retake">
        <i class="fas fa-redo"></i> Retake Quiz
      </button>
    `;
    
    document.getElementById(`${containerId}-retake`).addEventListener('click', () => {
      setupQuiz();
      // Scroll to top of quiz container
      const y = container.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({top: y, behavior: 'smooth'});
    });
  }

  // Start the quiz
  setupQuiz();
}

// --- EXPORT TIMER FUNCTIONS ---
export { 
  startQuizTimer, 
  stopQuizTimer, 
  resetQuizTimer, 
  updateTimerDisplay,
  getTimerStatus 
};

function getTimerStatus() {
  return {
    timeLeft: timeLeft,
    isRunning: isTimerRunning
  };
}