let battleStarted = false;
let battleSubmitted = false;
let interval;
let timeLeft = 300;

const problems = [
  "Two Sum",
  "Binary Search",
  "Valid Parentheses",
  "Merge Intervals",
  "Longest Substring Without Repeating Characters"
];


const startBattleBtn = document.getElementById("startBattleBtn");
const submitSolutionBtn = document.getElementById("submitSolutionBtn");

const timer = document.getElementById("timer");
const winnerText = document.getElementById("winnerText");
const xpReward = document.getElementById("xpReward");

const problemTitle =
document.getElementById("problemTitle");

const opponentElement =
document.getElementById("currentOpponent");

const difficultyElement =
document.getElementById("difficultyBadge");

const historyGrid =
document.getElementById("historyGrid");

document
.getElementById("startBattleBtn")
.addEventListener("click", () => {

    const opponent =
    document.getElementById("opponentName").value;

    const difficulty =
    document.getElementById("difficultySelect").value;

    opponentElement.textContent =
    opponent || "Guest";

    difficultyElement.textContent =
    difficulty;

    const randomProblem =
    problems[Math.floor(Math.random() * problems.length)];

    problemTitle.textContent =
    `${randomProblem} Challenge`;
   
});

startBattleBtn.addEventListener("click", () => {

    battleStarted = true;
    battleSubmitted = false;

    winnerText.textContent = "Winner: -";
    xpReward.textContent = "0";

    timeLeft = 300;

    clearInterval(interval);
    startBattleBtn.disabled = true;
    interval = setInterval(() => {

        timeLeft--;

        timer.textContent = timeLeft;

        if(timeLeft <= 0){

            clearInterval(interval);

            if(!battleSubmitted){
                showLoss();
            }
        }

    },1000);

});

submitSolutionBtn.addEventListener("click", () => {

    const code =
    document.getElementById("solutionCode").value;
    if (!battleStarted) {
    alert("Start a battle first!");
    return;
    }


    if(code.trim().length < 20){

        alert("Please write a solution before submitting.");

        return;
    }

    battleSubmitted = true;

    clearInterval(interval);

    showVictory();

});


function showVictory(){

    const difficulty =
    document.getElementById("difficultySelect").value;

    let xp = 50;

    if(difficulty === "Medium") xp = 100;
    if(difficulty === "Hard") xp = 150;

    winnerText.textContent = "Winner: You";

    xpReward.textContent = xp;

    addHistory("Victory", `${xp} XP`);

    timer.textContent = 300;
    timeLeft = 300;

    startBattleBtn.disabled = false;
    battleStarted = false;
}

function showLoss(){

    winnerText.textContent = "Winner: Opponent";

    xpReward.textContent = "0";

    addHistory("Defeat", "0 XP");

    timer.textContent = 300;
    timeLeft = 300;

    startBattleBtn.disabled = false;
    battleStarted = false;
}

function addHistory(result, xp){

    const historyGrid =
    document.getElementById("historyGrid");

    historyGrid.innerHTML += `
        <div class="history-card">
            <h3>${result}</h3>
            <p>${xp}</p>
            <p>${new Date().toLocaleDateString()}</p>
        </div>
    `;
}
