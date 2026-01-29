let state = { energy:"", tasks:[] };
let deadlineOn = false;
let dragSrcId = null;
let lastDeleted = null;
let lastDeletedTimer = null;
const timers = new Map();

// DOM
const energySelect = document.getElementById("energy");
const energyStatus = document.getElementById("energyStatus");
const taskInput = document.getElementById("taskInput");
const taskEnergy = document.getElementById("taskEnergy");
const addTaskBtn = document.getElementById("addTask");
const allTaskList = document.getElementById("allTaskList");
const energyTaskList = document.getElementById("energyTaskList");
const taskError = document.getElementById("taskError");
const deadlineDate = document.getElementById("deadlineDate");
const deadlineToggle = document.getElementById("deadlineToggle");
const toggleBox = document.getElementById("toggleBox");
const toastContainer = document.getElementById("toastContainer");

// Storage
function saveState(){ localStorage.setItem("plannerState", JSON.stringify(state)); }
function loadState(){
  const saved = localStorage.getItem("plannerState");
  if(saved){ state = JSON.parse(saved); energySelect.value=state.energy; }
}

function renderEnergy(){ energyStatus.textContent = state.energy ? `Current energy: ${state.energy.toUpperCase()}` : ""; }

function clearTimers(){
  timers.forEach((v)=>clearInterval(v));
  timers.clear();
}

//  Undo
function showUndo(task,index){
  toastContainer.innerHTML="";
  const div=document.createElement("div"); div.className="toast";
  div.textContent="Task removed.";
  const btn=document.createElement("button"); btn.textContent="Undo";
  btn.addEventListener("click",()=>{
    state.tasks.splice(index,0,task);
    saveState(); renderTasks(); toastContainer.innerHTML="";
    clearTimeout(lastDeletedTimer);
  });
  div.appendChild(btn); toastContainer.appendChild(div);
  lastDeletedTimer=setTimeout(()=>{toastContainer.innerHTML="";},10000);
}

// Create task element
function createTaskElement(task,index,allowDrag=false){
  const li=document.createElement("li");
  li.className = task.hasDeadline ? "task deadline" : `task ${task.energy}`;
  li.dataset.id = task.id;

  const row=document.createElement("div"); row.className="task-row";

  if(allowDrag){
    const handle=document.createElement("span");
    handle.className="drag-handle"; handle.textContent="≡"; handle.draggable=true;
    handle.addEventListener("dragstart",(e)=>{
      dragSrcId = task.id;
      e.dataTransfer.effectAllowed="move";
    });
    row.appendChild(handle);
  }

  const span=document.createElement("span");
  const displayDeadline = task.hasDeadline ? ` — Due: ${new Date(task.deadline).toLocaleString()}` : "";
  span.textContent = task.text + displayDeadline;
  row.appendChild(span);

  const btnContainer=document.createElement("div"); btnContainer.className="task-buttons";

  const doneBtn=document.createElement("button"); doneBtn.textContent="Done"; 
  doneBtn.addEventListener("click", ()=>{
    lastDeleted = {...task};
    const idx = state.tasks.findIndex(t=>t.id===task.id);
    state.tasks.splice(idx,1); saveState(); renderTasks();
    showUndo(lastDeleted,idx);
  });

  const delBtn=document.createElement("button"); delBtn.textContent="Delete"; delBtn.style.background="#ef4444";
  delBtn.addEventListener("click", ()=>{
    lastDeleted = {...task};
    const idx = state.tasks.findIndex(t=>t.id===task.id);
    state.tasks.splice(idx,1); saveState(); renderTasks();
    showUndo(lastDeleted,idx);
  });

  const editBtn=document.createElement("button"); editBtn.textContent="Edit"; editBtn.style.background="#fbbf24";
  editBtn.addEventListener("click", ()=>{
    const newText = prompt("Edit task text:", task.text);
    if(newText!==null && newText.trim()!==""){ task.text=newText.trim(); }
    const newEnergy = prompt("Edit energy (low, medium, high):", task.energy);
    if(["low","medium","high"].includes(newEnergy)){ task.energy=newEnergy; }
    if(task.hasDeadline){
      const newDeadline = prompt("Edit deadline (YYYY-MM-DDTHH:MM):", task.deadline);
      if(newDeadline && new Date(newDeadline)>new Date()){ task.deadline = new Date(newDeadline).toISOString(); }
    }
    saveState(); renderTasks();
  });

  btnContainer.appendChild(doneBtn);
  btnContainer.appendChild(delBtn);
  btnContainer.appendChild(editBtn);
  row.appendChild(btnContainer);
  li.appendChild(row);

  if(task.hasDeadline){
    const cd=document.createElement("div"); cd.className="countdown";
    li.appendChild(cd);

    function updateCountdown(){
      const now=new Date();
      const deadlineTime=new Date(task.deadline);
      const diff = deadlineTime-now;
      if(diff>0){
        const h=Math.floor(diff/3600000);
        const m=Math.floor((diff%3600000)/60000);
        const s=Math.floor((diff%60000)/1000);
        cd.textContent=`Time left: ${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        cd.classList.remove("urgent","warning");
        if(diff<3600000) cd.classList.add("urgent");
        else if(diff<86400000) cd.classList.add("warning");
      } else { cd.textContent="Deadline passed!"; cd.classList.add("urgent"); }
    }
    updateCountdown();
    if(timers.has(task.id)) clearInterval(timers.get(task.id));
    timers.set(task.id,setInterval(updateCountdown,1000));
  }

  return li;
}

// Render tasks
function renderTasks(){
  clearTimers();
  allTaskList.innerHTML="";
  energyTaskList.innerHTML="";

  if(state.tasks.length===0){ 
    const li=document.createElement("li"); li.className="empty"; li.textContent="No tasks added."; allTaskList.appendChild(li); 
  } else {
    state.tasks.forEach((task,index)=>{
      allTaskList.appendChild(createTaskElement(task,index,false));
    });
  }

  const deadlineTasks = state.tasks.filter(t=>t.hasDeadline).sort((a,b)=>new Date(a.deadline)-new Date(b.deadline));
  const energyTasks = state.tasks.filter(t=>!t.hasDeadline && t.energy===state.energy);
  const suggestedTasks = [...deadlineTasks,...energyTasks];

  if(suggestedTasks.length===0){ 
    const li=document.createElement("li"); li.className="empty"; li.textContent="No suggested tasks for current energy. Switch energy level to see other tasks."; energyTaskList.appendChild(li);
  } else {
    suggestedTasks.forEach((task,index)=>{
      const li=createTaskElement(task,index,!task.hasDeadline);
      li.addEventListener("dragover", e=>{ e.preventDefault(); });
      li.addEventListener("drop", e=>{
        e.preventDefault();
        if(!dragSrcId) return;
        const draggedIndex = state.tasks.findIndex(t=>t.id===dragSrcId);
        const dropIndex = state.tasks.findIndex(t=>t.id===task.id);
        const [draggedTask] = state.tasks.splice(draggedIndex,1);
        state.tasks.splice(dropIndex,0,draggedTask);
        dragSrcId = null; saveState(); renderTasks();
      });
      energyTaskList.appendChild(li);
    });
  }
}

// Events
energySelect.addEventListener("change",()=>{
  state.energy=energySelect.value;
  saveState(); renderEnergy(); renderTasks();
});

deadlineToggle.addEventListener("click",()=>{
  deadlineOn = !deadlineOn;
  toggleBox.classList.toggle("toggle-on", deadlineOn);
  deadlineDate.style.display=deadlineOn?"block":"none";
  if(!deadlineOn) deadlineDate.value="";
});

addTaskBtn.addEventListener("click",()=>{
  taskError.textContent="";
  const text = taskInput.value.trim();
  if(!text){ taskError.textContent="Task cannot be empty."; return; }
  if(text.length>150){ taskError.textContent="Task too long (max 150 chars)."; return; }

  let deadline=null;
  if(deadlineOn){
    if(!deadlineDate.value){ taskError.textContent="Please select deadline date & time."; return; }
    if(new Date(deadlineDate.value)<new Date()){ taskError.textContent="Deadline cannot be in the past."; return; }
    deadline = new Date(deadlineDate.value).toISOString();
  }

  const duplicate = state.tasks.some(t => t.text===text && t.deadline===deadline);
  if(duplicate){ taskError.textContent="Task already exists."; return; }

  const id = Date.now().toString() + Math.floor(Math.random()*1000); // unique id
  state.tasks.push({ id, text, energy: taskEnergy.value, hasDeadline: deadlineOn, deadline });
  taskInput.value=""; deadlineOn=false; toggleBox.classList.remove("toggle-on"); deadlineDate.value=""; deadlineDate.style.display="none";
  saveState(); renderTasks();
});

// Keyboard shortcuts
document.addEventListener("keydown",e=>{
  if(e.key==="1") energySelect.value=state.energy="low";
  if(e.key==="2") energySelect.value=state.energy="medium";
  if(e.key==="3") energySelect.value=state.energy="high";
  saveState(); renderEnergy(); renderTasks();
});

loadState(); renderEnergy(); renderTasks();
