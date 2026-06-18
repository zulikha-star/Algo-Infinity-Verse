/**
 * Reusable quiz module for Algo Infinity Verse
 */

export function initQuiz({ containerId, questions }) {
  const container = document.getElementById(containerId);
  if (!container || !questions || questions.length === 0) return;

  let currentQuestions = [];
  let hasSubmitted = false;

  // Helper to shuffle an array (Fisher-Yates)
  function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Initialize and shuffle quiz data
  function setupQuiz() {
    hasSubmitted = false;
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
  }

  // Handle quiz submission
  function handleSubmit() {
    if (hasSubmitted) return;
    hasSubmitted = true;
    
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
    form.querySelector('.submit-quiz-btn').style.display = 'none';
    
    // Show score
    const scoreDiv = document.getElementById(`${containerId}-score`);
    scoreDiv.style.display = 'block';
    
    const pct = Math.round((score / currentQuestions.length) * 100);
    let message = '';
    if (pct === 100) message = 'Perfect score! Outstanding!';
    else if (pct >= 70) message = 'Great job! You have a solid understanding.';
    else message = 'Good effort! Review the concepts and try again.';
    
    scoreDiv.innerHTML = `
      <div class="score-header">
        <h3>Quiz Results</h3>
        <div class="score-circle ${pct >= 70 ? 'good' : 'needs-work'}">
          <span class="score-number">${score}/${currentQuestions.length}</span>
        </div>
      </div>
      <p class="score-message">${message}</p>
      <button class="btn btn-secondary retake-quiz-btn" id="${containerId}-retake"><i class="fas fa-redo"></i> Retake Quiz</button>
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
