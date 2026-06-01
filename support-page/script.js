const supportForm = document.getElementById("supportForm");
const bugForm = document.getElementById("bugForm");
supportForm.addEventListener("submit", function (e) {
    e.preventDefault();
    showMessage("Support request submitted!");
    supportForm.reset();
});
bugForm.addEventListener("submit", function (e) {
    e.preventDefault();
    showMessage("Bug report submitted!");
    bugForm.reset();
});
function showMessage(text) {
    const message = document.createElement("div");
    message.innerText = text;
    message.className = "message-box";
    document.body.appendChild(message);
    setTimeout(() => {
        message.remove();
    }, 2000);
}