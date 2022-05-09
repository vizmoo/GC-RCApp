import { VideoPlayer } from "./video-player.js";
import { registerGamepadEvents, registerKeyboardEvents, registerMouseEvents, sendClickEvent } from "./register-events.js";
import { getServerConfig } from "./config.js";
import * as Logger from "./logger.js";

setup();

let videoPlayer;
let useWebSocket;
let connectionId;

//State modes
//Note that 'id' MUST match RCmodeStatesEnum values in GC.
const STATE_MODE = { //See GC:RemoteControl:RCmodeStateEnums
  Stopped: {id: "Stopped", display: "Stopped"},
  Calibrating: {id: "Calibrating", display: "Calibrating"},
  LoadingLevel: {id: "LoadingLevel", display: "Loading Level"},
  CatchingReadyToStart: {id: "CatchingReadyToStart", display: "Ready to Start"},
  Catching: {id: "Catching", display: "Catching"}, //catching a level, actual gameplay
  CatchingPaused: {id: "CatchingPaused", display: "Paused"},
  SystemMenuActive: {id: "SystemMenuActive", display: "Quest Menu Active"},

  //States for internal behaviors that need to redraw the UI.
  //Use all caps to help differentiate.
  //These are NOT defined in GC, used only within this app.
  PAIRING: {id: "PAIRING", display: "Pairing"},
  CHOOSE_PLAYLIST: {id: "CHOOSE_PLAYLIST", display: "Choose Playlist"},
  CHOOSE_LEVEL: {id: "CHOOSE_LEVEL", display: "Choose Level"},
  UNHANDLED: {id: "UNHANDLED", display: "Unhandled"}
}

//Actions that are sent to GC to change things there.
//Values must match GC:RemoteControl:actionsEnum
const ACTIONS = { 
    START_CATCHING: "StartCatching",
    PAUSE: "Pause",
    RESUME_CATCHING: "PausedResumeCatching",
    RESTART_CATCHING: "PausedRestartCatching",
    QUIT_CANCEL: "QuitCancel",
    FORCE_CANCEL: "ForceCancel",
    SET_CALIBRATION_MODE: "SetCalibrationMode",
    SET_CASTING: "SetCasting",
    SET_GAME_VOLUME: "SetGameVolume",
    SET_SHOWSCORE: "SetShowScore",
    SET_SHOW_UI: "SetShowUI",
    GET_PLAYLISTS: "GetPlaylists",
    LOAD_LEVEL: "LoadLevel"
}

// For testing population of sidebar list with playlists and levels
let samplePlaylists = [
{
  name: "Cool Playlist",
  creator: "Bungo Sprungo",
  date: "09/04/2000",
  notes: "This is not a real playlist",
  levels: [
    {
      name: "Cool Level",
      difficulty: "Medium",
      song: "10 Minutes of Microwaves Beeping",
      creator: "MicrowaveFan444",
      date: "04/13/2009",
      notes: "WARNING: There will be microwaves"
    },
    {
      name: "Cooler Level",
      difficulty: "Hard",
      song: "Mary Had a Little Lamb (Xylophone Cover)",
      creator: "TimothyAge5",
      date: "02/10/2017",
      notes: "His first cover :)"
    },
    {
      name: "Coolest Level",
      difficulty: "Expert",
      song: "Song song",
      creator: "Creator_Creator",
      date: "01/01/1901",
      notes: "Notes notes notes notes"
    }
  ]
},
{
  name: "Lame Playlist",
  creator: "Sprungo Bungo",
  date: "12/31/9999",
  notes: "This one honestly just kinda blows",
  levels: [
    {
      name: "Lame Level",
      difficulty: "Easy",
      song: "Silence 10 Hours",
      creator: "fan_of_boring_things_1993",
      date: "12/32/9999",
      notes: "Boring as hell :/"
    }
  ]
}
]

// For testing population of headset ID list
let sampleHeadsets = [
  {
    name: "VZ001",
    //passcode: "AAAAA"
  },
  {
    name: "X4963E21",
    //passcode: "edocssap"
  }
]

//TODO - move to currentState?
let selectedPlaylist = null;
let selectedLevel = null;
let selectedHeadset = null;

let currentState = {
  //The primary state mode we're in
  mode: STATE_MODE.UNHANDLED,
  //Other items that make up the state
  videoEnabled: true,
  volumeValue: 100,
  scoreEnabled: true,
  scoreValue: 0,
  uiEnabled: true,
  seatedMode: false
}

// Video event handlers from sample project
window.document.oncontextmenu = function () {
  return false;     // cancel default menu
};

window.addEventListener('resize', function () {
  videoPlayer.resizeVideo();
}, true);

window.addEventListener('beforeunload', async () => {
  await videoPlayer.stop();
}, true);

//Runs on page load, sets up UI event handlers and layout
async function setup() {
  //Stauffer - logger must be enabled
  Logger.enable();

  const res = await getServerConfig();
  useWebSocket = res.useWebSocket;

  //UI items that only exist in PAIRING state
  setStateMode(STATE_MODE.PAIRING.id);
  controlTopbar.style.backgroundColor = "black";
  videoArea.style.backgroundColor = "black";
  const headsetList = document.getElementById("headsetList")
  PopulateList(headsetList, sampleHeadsets)  

  const connectToHeadsetButton = document.getElementById("connectToHeadsetButton")
  connectToHeadsetButton.addEventListener("click", connectToSelectedHeadset);

  const videoToggleButton = document.getElementById("videoToggleButton")
  const videoToggleText = document.getElementById("videoToggleText")
  videoToggleButton.addEventListener("click", function () {
    currentState.videoEnabled = !currentState.videoEnabled
    videoToggleText.innerHTML = currentState.videoEnabled ? "Video On" : "Video Off"
  });

  const volumeButton = document.getElementById("volumeButton")
  const volumeSlider = document.getElementById("volumeSlider")
  volumeButton.addEventListener("click", function () {
    if (volumeSlider.style.display === "none") {
      volumeSlider.style.display = "block";
    } else {
      volumeSlider.style.display = "none";
    }
  });

  //Volume slider toggle event
  $('.ui.slider')
  .slider({
    min: 0,
    max: 100,
    start: 100,
    step: 1,
    onChange: function (e,v) {
      currentState.volumeValue = v;
      const volumeText = document.getElementById("volumeText");
      volumeText.innerHTML = "Vol " + currentState.volumeValue;
    }
  })

  const scoreToggleButton = document.getElementById("scoreToggleButton")
  const scoreToggleText = document.getElementById("scoreToggleText")
  scoreToggleButton.addEventListener("click", function () {
    currentState.scoreEnabled = !currentState.scoreEnabled;
    let toggleText = currentState.scoreEnabled ? "Visible" : "Hidden";
    scoreToggleText.innerHTML = "Score " + toggleText + " " + currentState.scoreValue;
    //sendTestMessageJSON(videoPlayer, "New Score Visibility: " + toggleText);
    sendGCAction(ACTIONS.SET_SHOWSCORE, [currentState.scoreEnabled.toString()]);
  });

  const uiToggleButton = document.getElementById("uiToggleButton")
  const uiToggleText = document.getElementById("uiToggleText")
  uiToggleButton.addEventListener("click", function () {
    currentState.uiEnabled = !currentState.uiEnabled
    uiToggleText.innerHTML = currentState.uiEnabled ? "UI On" : "UI Off"
  });

  const forceCancelButton = document.getElementById("forceCancelButton")
  forceCancelButton.addEventListener("click", function () {
    sendGCAction(ACTIONS.FORCE_CANCEL);
  })

  const startCasualButton = document.getElementById("startCasualButton")
  startCasualButton.addEventListener("click", function () {
    sendGCAction(ACTIONS.START_CATCHING, ['Casual']);
  })

  const startCompetitiveButton = document.getElementById("startCompetitiveButton")
  startCompetitiveButton.addEventListener("click", function () {
    sendGCAction(ACTIONS.START_CATCHING, ['Competitive']);
  })

  const cancelStartButton = document.getElementById("cancelStartButton")
  cancelStartButton.addEventListener("click", function () {
    sendGCAction(ACTIONS.QUIT_CANCEL);
  })

  const pauseButton = document.getElementById("pauseButton")
  pauseButton.addEventListener("click", function () {
    sendGCAction(ACTIONS.PAUSE);
  })

  const pauseResumeButton = document.getElementById("pauseResumeButton")
  pauseResumeButton.addEventListener("click", function () {
    sendGCAction(ACTIONS.RESUME_CATCHING);
  })

  const pauseRestartButton = document.getElementById("pauseRestartButton")
  pauseRestartButton.addEventListener("click", function () {
    sendGCAction(ACTIONS.RESTART_CATCHING); //
  })

  const pauseQuitButton = document.getElementById("pauseQuitButton")
  pauseQuitButton.addEventListener("click", function () {
    sendGCAction(ACTIONS.QUIT_CANCEL);
  })

  const replayLevelButton = document.getElementById("replayLevelButton")
  replayLevelButton.addEventListener("click", function () {
    //???
    //sendGCAction(ACTIONS.);
  })

  const seatedToggleButton = document.getElementById("seatedToggleButton")
  const seatedToggleText = document.getElementById("seatedToggleText")
  seatedToggleButton.addEventListener("click", function () {
    sendGCAction(ACTIONS.SET_CALIBRATION_MODE, ['???']);
    //testing? why is this here and not in updateElementVisibility?
    //state.seatedMode = !state.seatedMode
    //seatedToggleText.innerHTML = state.seatedMode ? "Seated Mode On" : "Seated Mode Off"
  })

  const calibratingCancelButton = document.getElementById("calibratingCancelButton")
  calibratingCancelButton.addEventListener("click", function () {
    sendGCAction(ACTIONS.QUIT_CANCEL);
  })

  //Debug Buttons are used for changing state when the condition would need to come from the game
  //Once we have the app communicating with the game over data channel we won't need these anymore
  //--------BEGIN DEBUG BUTTONS---------
  const goToLoading = document.getElementById("goToLoading")
  goToLoading.addEventListener("click", function () {
    sendGCAction(STATE_MODE.LOADING_LEVEL)
  })

  const goToLevelStart = document.getElementById("goToLevelStart")
  goToLevelStart.addEventListener("click", function () {
    sendGCAction(STATE_MODE.CATCHING_READY_TO_START)
  })

  const endLevel = document.getElementById("endLevel")
  endLevel.addEventListener("click", function () {
    sendGCAction(STATE_MODE.Stopped)
  })

  const goToSystemMenu = document.getElementById("goToSystemMenu")
  goToSystemMenu.addEventListener("click", function () {
    sendGCAction(STATE_MODE.SYSTEM_MENU)
  })

  const goToUnhandled = document.getElementById("goToUnhandled")
  goToUnhandled.addEventListener("click", function () {
    sendGCAction(STATE_MODE.UNHANDLED)
  })

  const goToStopped = document.getElementById("goToStopped")
  goToStopped.addEventListener("click", function () {
    sendGCAction(STATE_MODE.Stopped)
  })
  //--------END DEBUG BUTTONS---------

  const chooseLevelButton = document.getElementById("chooseLevelButton")
  chooseLevelButton.addEventListener("click", function() {
    //Reveal sidebar on click
    $('.ui.sidebar')
      .sidebar('show')
    ;
    const levelList = document.getElementById("levelList")
    setStateMode(STATE_MODE.CHOOSE_PLAYLIST.id);
    PopulateSidebarList(levelList);
  })

  //Sidebar properties
  $('.ui.sidebar').sidebar(
  {
    dimPage: false,
    transition: 'overlay',
    exclusive: false,
    closable: false,
    onHidden: function(){
      //Clear out details on hidden
      const levelList = document.getElementById("levelList")
      levelList.innerHTML = ''
      document.getElementById("detailsCreator").innerHTML = "Creator: "
      document.getElementById("detailsDate").innerHTML = "Date Modified: "
      document.getElementById("detailsNotes").innerHTML = "Notes: "
    }
  })

  //Close button will either close the sidebar or go back to playlist selection depending on state
  const closeSidebarButton = document.getElementById("closeSidebarButton")
  closeSidebarButton.addEventListener("click", function() {
    if (currentState.mode.id === STATE_MODE.CHOOSE_PLAYLIST.id) {
      $('.ui.sidebar')
        .sidebar('hide')
      ;
      //TODO sort this. Seems we should only be able to choose playlists when 
      // we're stopped, so just go back to stopped? If GC has moved on, it 
      // may be handled automatically depending on how we set up state checks.
      setStateMode(STATE_MODE.Stopped.id);
    } else if (currentState.mode.id === STATE_MODE.CHOOSE_LEVEL.id) {
      setStateMode(STATE_MODE.CHOOSE_PLAYLIST.id);
      const levelList = document.getElementById("levelList");
      levelList.innerHTML = '';
      PopulateSidebarList(levelList);
    }
  })

  //Use button will either advance to level selection or close sidebar with selected song depending on state
  const useSongSidebarButton = document.getElementById("useSongSidebarButton")
  useSongSidebarButton.addEventListener("click", function() {
    if (currentState.mode.id === STATE_MODE.CHOOSE_PLAYLIST.id && selectedPlaylist !== null) {
      setStateMode(STATE_MODE.CHOOSE_LEVEL.id)
      const levelList = document.getElementById("levelList")
      levelList.innerHTML = ''
      PopulateSidebarList(levelList)
    } else if (currentState.mode.id === STATE_MODE.CHOOSE_LEVEL.id && selectedLevel !== null) {
      $('.ui.sidebar')
        .sidebar('hide')
      ;
      const levelName = document.getElementById("levelName")
      levelName.innerHTML = selectedLevel.name
      const songName = document.getElementById("songName")
      songName.innerHTML = selectedLevel.song
      sendGCAction(ACTIONS.LOAD_LEVEL, ['level info...']); //should we set local state to LoadingLevel, or do that in sendGCAction?
    }
  })
}

/**
 * Request an action be performed by GC
 * @param {string} action - action string as defined in ACTIONS
 * @param {*} params - array of parameter values as required if the action requires a parameter. Pass native value, will be converted to string.
 */
function sendGCAction(action, params = []) {
  //Validate action string
  if(!Object.values(ACTIONS).includes(action)){
    //TODO - error handling!
    Logger.error("sendGCAction: unrecognized action: " + action +". Ignoring.");
    return;
  }

  //Setup parameters
  //Make sure they're all passed as strings
  let paramsOut = [];
  params.forEach( p => {
    paramsOut.push(p.toString());
  })

  //Send the action
  sendCommandJSON('Action', action, paramsOut);
}

// Updates the state of the game, changes text on UI, and toggles visibility of elements based on state.
// Should only be used when we have a new state from GC, or with internal states
//  like controlling playlist/song selection views
function setStateMode(stateModeId){
  currentState.mode = STATE_MODE[stateModeId];
  const stateText = document.getElementById("stateText");
  stateText.innerHTML = currentState.mode.display;
  updateElementVisibility()
}

// UI Elements that are only visible in a certain state are given the class "STATE" and the const 'id' field of the state in STATE_MODE[] prepended by 'state'.
// Example: An element with class="STATE stateStopped" would only be visible in the "Stopped" state
// If an element has the class "HIDESTATE" and a state name, then it will only be HIDDEN when in that state, and visible in any other state
// Example: An element with class="HIDESTATE statePAIRING" would be hidden in the "PAIRING" state, but visible in every other state
// This function toggles the visibility of elements tagged with "STATE" or "HIDESTATE" based on the current state
function updateElementVisibility() {
  const stateElements = document.getElementsByClassName("STATE")
  for (var i = 0; i < stateElements.length; i++) {
    const element = stateElements[i]
    const stateClass = 'state'+currentState.mode.id;
    element.style.display = (element.classList.contains(stateClass)) ? "flex" : "none"
  }
  const hideStateElements = document.getElementsByClassName("HIDESTATE")
  for (var i = 0; i < hideStateElements.length; i++) {
    const element = hideStateElements[i]
    const hideStateClass = 'state'+currentState.mode.id;
    element.style.visibility = (element.classList.contains(hideStateClass)) ? "hidden" : "visible"
  }
}

function getKeyByValue(object, value) {
  return Object.keys(object).find(key => object[key] === value);
}

// This function updates the sidebar list to populate either playlists or levels, and gives each button a listener that updates the details when selected
// TODO: Merge PopulateList and PopulateSidebarList, or call PopulateList within PopulateSidebarList to eliminate repeated code
function PopulateSidebarList(levelList) {
  let listItems;
  if (currentState.mode.id === STATE_MODE.CHOOSE_PLAYLIST.id) {
    listItems = samplePlaylists
    document.getElementById("chooseLevelText").innerHTML = "Choose a Playlist"
    document.getElementById("closeSidebarButton").innerHTML = "Cancel"
    document.getElementById("detailsTitle").innerHTML = "Playlist Details"
  } else if (currentState.mode.id === STATE_MODE.CHOOSE_LEVEL.id) {
    listItems = selectedPlaylist.levels;
    document.getElementById("chooseLevelText").innerHTML = "Choose a Level"
    document.getElementById("closeSidebarButton").innerHTML = "Back"
    document.getElementById("detailsTitle").innerHTML = "Level Details"
  }
  listItems.forEach(function(item, index) {
    const listItem = document.createElement("tr");
    const listButton = document.createElement("td");
    listButton.className = "ui sixteen wide big button";
    listButton.innerHTML = item.name;

    listItem.append(listButton)
    levelList.append(listItem)

    document.getElementById("detailsDifficulty").innerHTML = "Difficulty: "
    document.getElementById("detailsSong").innerHTML = "Song: "
    document.getElementById("detailsCreator").innerHTML = "Creator: "
    document.getElementById("detailsDate").innerHTML = "Date Modified: "
    document.getElementById("detailsNotes").innerHTML = "Notes: "

    listButton.addEventListener("click", function() {
      if (currentState.mode.id === STATE_MODE.CHOOSE_PLAYLIST.id) {
        selectedPlaylist = item;
      } else if (currentState.mode.id === STATE_MODE.CHOOSE_LEVEL.id) {
        selectedLevel = item;
        document.getElementById("detailsDifficulty").innerHTML = "Difficulty: " + item.difficulty
        document.getElementById("detailsSong").innerHTML = "Song: " + item.song
      }
      document.getElementById("detailsCreator").innerHTML = "Creator: " + item.creator
      document.getElementById("detailsDate").innerHTML = "Date Modified: " + item.date
      document.getElementById("detailsNotes").innerHTML = "Notes: " + item.notes
    })
  })
}

// This function populates the headset ID selection with headset IDs, and listeners that update the selectedHeadset when clicked
function PopulateList(list, listItems) {
  listItems.forEach(function(item, index) {
    const listItem = document.createElement("tr");
    const listButton = document.createElement("td");
    listButton.className = "ui sixteen wide big black button";
    const listButtonText = document.createElement("span");
    listButtonText.className = "ui yellow text"
    listButtonText.innerHTML = item.name;

    listButton.append(listButtonText)
    listItem.append(listButton);
    list.append(listItem);

    listButton.addEventListener("click", function() {
      selectedHeadset = item;;
      connectToSelectedHeadset();
      document.getElementById("selectedHeadsetText").innerHTML = "Selected: " + selectedHeadset.name;
    })
  })
}

// TODO: Leftover from sample, should be updated to work with errorText element
function showWarningIfNeeded(startupMode) {
  const warningDiv = document.getElementById("warning");
  if (startupMode == "private") {
    warningDiv.innerHTML = "<h4>Warning</h4> This sample is not working on Private Mode.";
    warningDiv.hidden = false;
  }
}

//Using the current 'selectedHeadset', make a connection and start video player
function connectToSelectedHeadset() {
  //Skip the passcode, at least for now
  //const passcodeInput = document.getElementById("passcodeInput")
  //const userInput = passcodeInput.value;
  if (true /*userInput === selectedHeadset.passcode*/) {
    setStateMode(STATE_MODE.Stopped.id)
    controlTopbar.style.backgroundColor = "grey";
    videoArea.style.backgroundColor = "grey";
    const headsetId = document.getElementById("headsetId")
    headsetId.innerHTML = selectedHeadset.name
    onSuccessfulPair()
  }
}

// From sample project, modified version of OnClickPlayButton()
// Creates video player element and calls setupVideoPlayer
// Called when passcode is accepted in PAIRING state, after transitioning to Stopped
function onSuccessfulPair() {
  console.log('--- video-player onSuccessfulPair');
  //connectionId = selectedHeadset.passcode;
  //Switch to using headset name as the passcode
  connectionId = selectedHeadset.name;

  const playerDiv = document.getElementById('player');

  // add video player
  const elementVideo = document.createElement('video');
  elementVideo.id = 'Video';
  elementVideo.style.touchAction = 'none';
  playerDiv.appendChild(elementVideo);

  setupVideoPlayer([elementVideo]).then(value => videoPlayer = value);

}

// From sample project
// Creates VideoPlayer object in video player element, creates connection with Connection ID
// See video-player.js
async function setupVideoPlayer(elements) {
  const videoPlayer = new VideoPlayer(elements);
  await videoPlayer.setupConnection(connectionId, useWebSocket);

  videoPlayer.mainDisconnect = processDisconnect;
  videoPlayer.mainProcessMessage = processMessage;

  /* Stauffer - disabled these.
     They look like there from the sample app for controlling camera from web app.
     May want something like this eventually but for now they generate noisy messages.
  registerGamepadEvents(videoPlayer);
  registerKeyboardEvents(videoPlayer);
  registerMouseEvents(videoPlayer, elements[0]);
  */

  return videoPlayer;
}

//Process a message from GC
function processMessage(msgString) {
  console.log("main.processMessage orig string: " + msgString);
  let msgObj = JSON.parse(msgString);
  console.log("   obj back to json: " + JSON.stringify(msgObj));
}

// Based on sample project
// Handles video player when connection is lost
function processDisconnect() {
  console.log('main.disconnect entered ---');
  const playerDiv = document.getElementById('player');
  clearChildren(playerDiv);
  videoPlayer.hangUp(connectionId);
  videoPlayer = null;
  connectionId = null;
  showPlayButton();
}

function clearChildren(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

// Given a video player object and string msg, allows you to send a stringified JSON across the data channel to the connected Unity game
// Currently sends the message and timestamp of message
// Currently unused, but do not delete
function sendTestMessageJSON(videoPlayer, msg) {
  let obj = {
    "message": msg,
    "timestamp": new Date()
  }
  videoPlayer && videoPlayer.sendMsg(JSON.stringify(obj));
}

//Send a command message as expected by RemoteControl in GC
function sendCommandJSON(command, subcommand, parametersArray) {
  if(!videoPlayer){
    Logger.error("sendCommandJSON: videoPlayer not valid");
    return;
  }
  let obj = {
    command: command,
    subcommand: subcommand,
    parameters: parametersArray,
    timestamp: new Date()
  }
  videoPlayer && videoPlayer.sendMsg(JSON.stringify(obj));
}