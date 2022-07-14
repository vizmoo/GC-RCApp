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
//
//*NOTE* if you change these look at index.html use of class<STATE_MODE.id> for rendering
//
const STATE_MODE = { 
  //Modes received from GC
  //See GC:RemoteControl:RCmodeStateEnums
  Stopped: { id: "Stopped", displayName: "Stopped" },
  Calibrating: { id: "Calibrating", displayName: "Calibrating" },
  LoadingLevel: { id: "LoadingLevel", displayName: "Loading Level" },
  CatchingReadyToStart: { id: "CatchingReadyToStart", displayName: "Ready to Start" },
  Catching: { id: "Catching", displayName: "Catching" }, //catching a level, actual gameplay
  CatchingPaused: { id: "CatchingPaused", displayName: "Paused" },
  SystemMenuActive: { id: "SystemMenuActive", displayName: "Quest System Menu Active" },
  //TODO something differet for this, instead of doubling up on UNHANDLED
  UnhandledMode: { id: "UNHANDLED", displayName: "Unhandled Mode"},

  //Modes for internal behaviors that need to redraw the UI.
  //Use all caps to help differentiate.
  //These are NOT defined in GC, used only within this app.
  PAIRING: { id: "PAIRING", displayName: "Pairing" },
  //When connection to headset has been requested but not yet established
  CONNECTION_REQUESTED: { id: "CONNECTION_REQUESTED", displayName: "Connection Requested..."},
  EXPECTING_GC_STATE: {id: "EXPECTING_GC_STATE", displayName: "Waiting for headset state..."},
  CHOOSE_PLAYLIST: { id: "CHOOSE_PLAYLIST", displayName: "Choose Playlist" },
  CHOOSE_LEVEL: { id: "CHOOSE_LEVEL", displayName: "Choose Level" },
  UNHANDLED: { id: "UNHANDLED", displayName: "Unhandled Error" }
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

//Valid message strings coming from GC.
//See OutgoingSignalMessage enum in GC:RemoteControl
const INCOMING_MESSAGES = {
  FULL_STATE: 'FullState',
  DEFINES: 'Defines',
  ALL_PLAYLISTS: 'AllPlaylists',
  CLOSING_CONNECTION: 'ClosingConnection',
  ERROR: 'Error',
  TEST_MESSAGE: 'TestMessage'
}

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


let state = {
  //The primary state mode the RCApp is in.
  //Can be different than the GC mode in GCstate member
  localModeObj: STATE_MODE.UNHANDLED,
  //Have our own store of this here?
  selectedHeadset: null,
  //Playlist data received from GC
  playlistData: {
    playlists: [], //array of playlist objects
    songIdNames: {} //dict object for looking up song name by unique id
  },
  //*locally selected* playlist object ref
  selectedPlaylist: null,
  //*locally selected* level object ref that will be sent to GC for loading request. Might not be same as *loaded* level
  selectedLevel: null,
  //The most recently-received GC state. See GC:RemoteControl:GCappState
  GC: null
}

/////////////////////////////////////////////////

//// Error handlers
//
function handleErrorException(contextString, errorString) {
  handleError(contextString, "Unhandled Exception: " + errorString);
}

function handleError(contextString, errorString) {
  Logger.error(contextString + " - " + errorString);
  //TODO show in display. Send to GC? Send to vizmoo site for error logging?
}

// Video event handlers from sample project
window.document.oncontextmenu = function () {
  return false;     // cancel default menu
};

window.addEventListener('resize', function () {
  videoPlayer?.resizeVideo && videoPlayer?.resizeVideo();
}, true);

window.addEventListener('beforeunload', async () => {
  await videoPlayer.stop();
}, true);

////
//Runs on page load, sets up UI event handlers and layout
async function setup() {
  //Stauffer - logger must be enabled
  Logger.enable();

  const res = await getServerConfig();
  useWebSocket = res.useWebSocket;

  //UI items that only exist in PAIRING state
  setModeByObj(STATE_MODE.PAIRING);
  controlTopbar.style.backgroundColor = "black";
  videoArea.style.backgroundColor = "black";
  const headsetList = document.getElementById("headsetList")
  PopulateHeadsetList(headsetList, sampleHeadsets)

  
  const connectionRequestedTryAgainButton = document.getElementById("connectionRequestedTryAgainButton")
  connectionRequestedTryAgainButton.addEventListener("click", Disconnect);

  const GCStateExpectedTryAgainButton = document.getElementById("GCStateExpectedTryAgainButton")
  GCStateExpectedTryAgainButton.addEventListener("click", Disconnect);

  const connectToHeadsetButton = document.getElementById("connectToHeadsetButton")
  connectToHeadsetButton.addEventListener("click", connectToSelectedHeadset);

  const videoToggleButton = document.getElementById("videoToggleButton")
  videoToggleButton.addEventListener("click", function () {
    sendGCAction(ACTIONS.SET_CASTING, [!state.GC?.isCasting]);
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
      min: 15, //don't make it zero, to avoid user turning it all the way down and being confused
      max: 100,
      start: 100,
      step: 1,
      onChange: function (e, v) {
        sendGCAction(ACTIONS.SET_GAME_VOLUME, [v/100.0]); //GC volume is [0,1]
      }
    })

  const scoreToggleButton = document.getElementById("scoreToggleButton")
  scoreToggleButton.addEventListener("click", function () {
    sendGCAction(ACTIONS.SET_SHOWSCORE, [!state.GC?.headsetScoreVisible]);
  });

  const uiToggleButton = document.getElementById("uiToggleButton")
  uiToggleButton.addEventListener("click", function () {
    sendGCAction(ACTIONS.SET_SHOW_UI, [!state.GC?.headsetUIenabled]);
  });
  
  const uiDisconnectButton = document.getElementById("uiDisconnectButton")
  uiDisconnectButton.addEventListener("click", function () {
    Disconnect();    
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

  const calibrationModeToggleButton = document.getElementById("calibrationModeButton")
  calibrationModeToggleButton.addEventListener("click", function () {
    let newMode = state.GC?.calibrationMode == 'StandingBasic' ? "SeatedBased" : "StandingBasic";
    sendGCAction(ACTIONS.SET_CALIBRATION_MODE, [newMode]);
  })

  const calibratingCancelButton = document.getElementById("calibratingCancelButton")
  calibratingCancelButton.addEventListener("click", function () {
    sendGCAction(ACTIONS.QUIT_CANCEL);
  })

  const chooseLevelButton = document.getElementById("chooseLevelButton")
  chooseLevelButton.addEventListener("click", function () {
    //Reveal sidebar on click
    sidebarShow(true);
    const levelList = document.getElementById("levelList")
    setModeByObj(STATE_MODE.CHOOSE_PLAYLIST);
    populateSidebarList(levelList);
  })

  //Sidebar properties
  $('.ui.sidebar').sidebar(
    {
      dimPage: false,
      transition: 'overlay',
      exclusive: false,
      closable: false,
      onHidden: function () {
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
  closeSidebarButton.addEventListener("click", function () {
    if (state.localModeObj === STATE_MODE.CHOOSE_PLAYLIST) {
      sidebarShow(false);
      //TODO sort this. Seems we should only be able to choose playlists when 
      // we're stopped, so just go back to stopped? If GC has moved on, it 
      // may be handled automatically depending on how we set up state checks.
      setModeByObj(STATE_MODE.Stopped);
    } 
    else if (state.localModeObj === STATE_MODE.CHOOSE_LEVEL) {
      setModeByObj(STATE_MODE.CHOOSE_PLAYLIST);
      const levelList = document.getElementById("levelList");
      levelList.innerHTML = '';
      populateSidebarList(levelList);
    } 
    else {
      //Something happened. Just close it completely w/out trying to
      // set state, we'll let GC state update handle that.
      sidebarShow(false);
    }
  })

  //'Use' button 
  //Will either advance to level selection or close sidebar and load selected level, depending on state
  const usePlaylistOrLevelSidebarButton = document.getElementById("usePlaylistOrLevelSidebarButton")
  usePlaylistOrLevelSidebarButton.addEventListener("click", useCurrentPlaylistOrLevel);

} ////////////////// setup 

/**
 * Request an action be performed by GC
 * @param {string} action - action string as defined in ACTIONS
 * @param {*} params - array of parameter values as required if the action requires a parameter. Pass native value, will be converted to string.
 */
function sendGCAction(action, params = []) {
  //Validate action string
  if (!Object.values(ACTIONS).includes(action)) {
    //TODO - error handling!
    Logger.error("sendGCAction: unrecognized action: " + action + ". Ignoring.");
    return;
  }

  //Setup parameters
  //Make sure they're all passed as strings
  let paramsOut = [];
  params.forEach(p => {
    paramsOut.push(p.toString());
  })

  //Send the action
  sendCommandJSON('Action', action, paramsOut);
}

// Updates the state of the game, changes text on UI, and toggles visibility of elements based on state.
// Should only be used when we have a new state from GC, or with internal states
//  like controlling playlist/song selection views
function setModeByObj(stateModeObj) {
  Logger.log("setStateMode: received state: " + stateModeObj.id + " - " + stateModeObj.displayName);
  state.localModeObj = stateModeObj;
  updateElementVisibility();
  updateStateDisplayElements();
}

//Set the state mode based on id.
//On error, does nothing.
function setModeById(stateModeId) {
  for(const [modeKey, modeObj] of Object.entries(STATE_MODE)){
    if( modeObj.id == stateModeId ){
      setModeByObj(modeObj);
      return;
    }
  }
  //error
  Logger.error("** setStateModeById: unrecognized id: " + stateModeId);
  return;
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
    const stateClass = 'state' + state.localModeObj.id;
    //display 'none' will hide element and it will NOT take up space in layout
    element.style.display = (element.classList.contains(stateClass)) ? "flex" : "none"
  }
  const hideStateElements = document.getElementsByClassName("HIDESTATE")
  for (var i = 0; i < hideStateElements.length; i++) {
    const element = hideStateElements[i]
    const hideStateClass = 'state' + state.localModeObj.id;
    //NOTE visibility of 'hidden' will hide the elements but it will still take upspac in the layout.
    element.style.visibility = (element.classList.contains(hideStateClass)) ? "hidden" : "visible"
  }
  //Sidebar
  //Make sure it gets closed when it shouldn't be open, which happens if
  // RCapp has it open, but state update comes from GC that forces it closed.
  if(state.localModeObj != STATE_MODE.Stopped &&
     state.localModeObj != STATE_MODE.CHOOSE_LEVEL &&
     state.localModeObj != STATE_MODE.CHOOSE_PLAYLIST)
  {
    sidebarShow(false);   
  }
}

//
function updateStateDisplayElements(){
  //mode
  const modeText = document.getElementById("modeText");
  modeText.innerHTML = state.localModeObj.displayName;

  //casting/video display
  const videoToggleText = document.getElementById("videoToggleText")
  videoToggleText.innerHTML = state.GC?.isCasting ? "Video On" : "Video Off"

  //volume
  const volumeText = document.getElementById("volumeText");
  volumeText.innerHTML = "Vol " + Math.trunc(Math.round(state.GC?.currentGameVolume * 100)); //GC volume is [0,1]

  //score
  let toggleText = state.GC?.headsetScoreVisible ? "Visible" : "Hidden";
  const scoreToggleText = document.getElementById("scoreToggleText")
  scoreToggleText.innerHTML = "Score " + toggleText + ": " + state.GC?.currentScore;

  //headset UI
  const uiToggleText = document.getElementById("uiToggleText")
  uiToggleText.innerHTML = state.GC?.headsetUIenabled ? "On" : "Off"

  //calibration mode
  const calibrationModeText = document.getElementById("calibrationModeText");
  //modes: StandingBasic, SeatedBasic
  calibrationModeText.innerHTML = state.GC?.calibrationMode == 'StandingBasic' ? "Calibration Mode: Standing" : "Calibration Mode: Seated";

  //current song and level
  const levelNameText = document.getElementById("levelName");
  levelNameText.innerHTML = state.GC?.currentLevelNameMenu;
  const songNameText = document.getElementById("songName");
  songNameText.innerHTML = state.GC?.currentSongDisplayName;

  //time displays
  const songTimeCurrentText = document.getElementById("songTimeCurrentText");
  songTimeCurrentText.innerHTML = getFormattedTime(state.GC?.currentLevelTimeSeconds);
  const songTimeDurationText = document.getElementById("songTimeDurationText");
  songTimeDurationText.innerHTML = getFormattedTime(state.GC?.currentLevelDurationSeconds)
}

function getFormattedTime(timeInSeconds) {
  if(timeInSeconds == null){
    timeInSeconds = 0;
  }
  let sec = (Math.round(timeInSeconds) % 60).toFixed(0).toString();
  let min = Math.trunc(timeInSeconds / 60).toString();
  return min.padStart(2,'0') + ":" + sec.padStart(2,'0');
}

/** Show/hide the playlist/level sidebar. Pass true to show, false to hide */
function sidebarShow(showIt) {
  $('.ui.sidebar').sidebar(showIt ? 'show' : 'hide');
}

function getKeyByValue(object, value) {
  return Object.keys(object).find(key => object[key] === value);
}

// This function updates the sidebar list to populate either playlists or levels, and gives each button a listener that updates the details when selected
// TODO: Merge PopulateHeadsetList and PopulateSidebarList, or call PopulateHeadsetList within PopulateSidebarList to eliminate repeated code
function populateSidebarList(levelList) {
  try {
    let listItems = [];
    if (state.localModeObj === STATE_MODE.CHOOSE_PLAYLIST) {
      listItems = state.playlistData.playlists;
      document.getElementById("closeSidebarButton").innerHTML = "Cancel"
      document.getElementById("detailsTitle").innerHTML = "Playlist Details"
      //If for some reason we don't have playlist data, tell user to cancel, and request the playlist data
      // BUT we should already have gotten it when connection is first made.
      let msg = listItems.length == 0 ? "Playlists not found. Requesting from headset. Please cancel and try again." : "Choose a Playlist"; 
      document.getElementById("chooseLevelText").innerHTML = msg;
      if(listItems.length == 0){
        requestPlaylists();
      }
    } 
    else if (state.localModeObj === STATE_MODE.CHOOSE_LEVEL) {
      if (state.selectedPlaylist == null) {
        //TODO error handling
        document.getElementById("chooseLevelText").innerHTML = "Something's wrong. No Playlist found."
        Logger.error("PopulateSidebarList: selectedPlaylist is null");
        return;
      } else {
        listItems = state.selectedPlaylist._levelsArray;
        document.getElementById("chooseLevelText").innerHTML = "Choose a Level"
        document.getElementById("closeSidebarButton").innerHTML = "Back"
        document.getElementById("detailsTitle").innerHTML = "Level Details"
      }
    }
    listItems.forEach(function (item, index) {
      //NOTE - item fields get serialized using Property name instead of backing field even though backing field is listed as serialized. Huh.
      let defaultClass = "ui sixteen wide big button"
      const listItem = document.createElement("tr");
      const listButton = document.createElement("td");
      listButton.className = defaultClass;
      listButton.innerHTML = item.NameMenu;

      listItem.append(listButton)
      levelList.append(listItem)

      //Empty fields before anything's selected
      document.getElementById("detailsDifficulty").innerHTML = "Difficulty: "
      document.getElementById("detailsSong").innerHTML = "Song: "
      document.getElementById("detailsCreator").innerHTML = "Creator: "
      document.getElementById("detailsDate").innerHTML = "Date Modified: "
      document.getElementById("detailsNotes").innerHTML = "Notes: "

      //When something is selected (but still have to click Use This button)
      listButton.addEventListener("click", function () {listButtonOnClick(listButton, item, defaultClass)});
      listButton.addEventListener("dblclick", function () {listButtonOnDoubleClick(listButton, item, defaultClass)});
    })
  }
  catch (error) {
    handleErrorException(Function.name, error);
    //TODO change state or something here
  }
}

function listButtonOnDoubleClick(listButton, item, defaultClass){
  listButtonOnClick(listButton, item, defaultClass);
  useCurrentPlaylistOrLevel();
}

//Playlist of level list button is single-clicked for selection
function listButtonOnClick(listButton, item, defaultClass){
  listButton.className = defaultClass + " secondary"; //emphasis - options: {primary, secondary, ...?}
  if (state.localModeObj === STATE_MODE.CHOOSE_PLAYLIST) {
    state.selectedPlaylist = item;
  } else if (state.localModeObj === STATE_MODE.CHOOSE_LEVEL) {
    //Levels
    state.selectedLevel = item;
    document.getElementById("detailsDifficulty").innerHTML = "Difficulty: " + (item.DifficultyRating ? item.DifficultyRating : "Not set");
    let songID = state.playlistData.songIdNames[item.SongSource.usid];
    let songName = songID ? songID : "- not found -";
    document.getElementById("detailsSong").innerHTML = "Song: " + songName;
  }
  //Levels and Playlists
  document.getElementById("detailsCreator").innerHTML = "Creator: " + item.Creator;
  document.getElementById("detailsDate").innerHTML = "Date Modified: " + item.DateModified;
  document.getElementById("detailsNotes").innerHTML = "Notes: " + item.Notes ? item.Notes : "";
}

function loadCurrentSelectedLevel() {
  if(state.selectedPlaylist == null){
    Logger.error("loadCurrentSelectedLevel: selectedPlaylist == null");
    return;
  }
  if(state.selectedLevel == null){
    Logger.error("loadCurrentSelectedLevel: selectedLevel == null");
    return;
  }

  //Send the playlist and level id's
  //NOTE - we don't change our local state here. Once GC gets this action it
  // will respond with state update that's it loading a level
  sendGCAction(ACTIONS.LOAD_LEVEL, [state.selectedPlaylist.UniqueID, state.selectedLevel.UniqueID]); 
}

// Request that GC send us its playlsists. 
// We expect an async return via message
function requestPlaylists() {
  sendGCAction(ACTIONS.GET_PLAYLISTS);
}

//Depending on mode, open and show levels of currently-selected playlist,
// or load the currently-selected level
function useCurrentPlaylistOrLevel(){
  if (state.localModeObj === STATE_MODE.CHOOSE_PLAYLIST && state.selectedPlaylist !== null) {
    setModeByObj(STATE_MODE.CHOOSE_LEVEL)
    const levelList = document.getElementById("levelList")
    levelList.innerHTML = ''
    populateSidebarList(levelList)
  } else if (state.localModeObj === STATE_MODE.CHOOSE_LEVEL && state.selectedLevel !== null) {
    sidebarShow(false);
    //Tell GC to try and load the level.
    loadCurrentSelectedLevel();
  }
}

// This function populates the headset ID selection with headset IDs, and listeners that update the selectedHeadset when clicked
function PopulateHeadsetList(list, listItems) {
  try {
    listItems.forEach(function (item, index) {
      const listItem = document.createElement("tr");
      const listButton = document.createElement("td");
      listButton.className = "ui sixteen wide big black button";
      const listButtonText = document.createElement("span");
      listButtonText.className = "ui yellow text"
      listButtonText.innerHTML = item.name;

      listButton.append(listButtonText)
      listItem.append(listButton);
      list.append(listItem);

      listButton.addEventListener("click", function () {
        state.selectedHeadset = item;;
        connectToSelectedHeadset();
        document.getElementById("selectedHeadsetText").innerHTML = "Selected: " + state.selectedHeadset.name;
      })
    })
  }
  catch (error) {
    handleErrorException(Function.name, error);
  }
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
  if (true /*userInput === state.selectedHeadset.passcode*/) {
    setModeByObj(STATE_MODE.CONNECTION_REQUESTED)
    //controlTopbar.style.backgroundColor = "grey";
    //videoArea.style.backgroundColor = "grey";
    const headsetId = document.getElementById("headsetId")
    headsetId.innerHTML = state.selectedHeadset.name
    //*NOTE* seems we should only call this when we get some kind of 
    // confirmation from signalling server that the connection is ready
    onSuccessfulPair()
  }
}

// From sample project, modified version of OnClickPlayButton()
// Creates video player element and calls setupVideoPlayer
// Called when passcode is accepted in PAIRING state, after transitioning to Stopped
function onSuccessfulPair() {
  Logger.log('--- main:onSuccessfulPair');
  //connectionId = state.selectedHeadset.passcode;
  //Switch to using headset name as the passcode
  connectionId = state.selectedHeadset.name;

  const playerDiv = document.getElementById('player');

  // add video player
  const elementVideo = document.createElement('video');
  elementVideo.id = 'videoElement';
  elementVideo.style.touchAction = 'none';
  playerDiv.appendChild(elementVideo);

  //TODO - error handling
  setupVideoPlayer([elementVideo]).then(value => videoPlayer = value);
}

// From sample project
// Creates VideoPlayer object in video player element, creates connection with Connection ID
// See video-player.js
async function setupVideoPlayer(elements) {
  const videoPlayer = new VideoPlayer(elements);

  //Assign callbacks to handle events from videoPlayer here in main
  videoPlayer.mainProcessSignalingDisconnect = processSignalingDisconnect;
  videoPlayer.mainProcessPeerDisconnect = processPeerDisconnect;
  videoPlayer.mainProcessMessage = processDataChannelMessage;
  videoPlayer.mainProcessOpen = processDataChannelOpened;
  videoPlayer.mainProcessChannelClose = processDataChannelClose;
  videoPlayer.mainProcessError = processDataChannelError;

  await videoPlayer.setupConnection(connectionId, useWebSocket);

  /* Stauffer - disabled these.
     They look like there from the sample app for controlling camera from web app.
     May want something like this eventually but for now they generate noisy messages.
  registerGamepadEvents(videoPlayer);
  registerKeyboardEvents(videoPlayer);
  registerMouseEvents(videoPlayer, elements[0]);
  */

  return videoPlayer;
}

/////////////////////////////////////////////////
////// Video Player / DataChannel event handlers

/**
 * Process a message from GC
 * @param {*} msgString String (JSON) received from GC
 */
function processDataChannelMessage(msgString) {
  //Logger.log("*** main.processDataChannelMessage orig string: " + msgString, true);
  let msgObj = JSON.parse(msgString);
  //TODO - some kind of validation of msgObj
  //Logger.log("   obj back to json: " + JSON.stringify(msgObj));

  //Process the message
  switch (msgObj.message) {
    case INCOMING_MESSAGES.FULL_STATE:
      //Some minimal validation
      if(!msgObj.dataObj || !msgObj.dataObj.GCMode){
        Logger.error("** processDataChannelMessage: FULL_STATE: GCMode not defined. msgString: " + msgString + "\nmsgObj: " + JSON.stringify(msgObj));
        return;
      }
      //Store the new state from GC    
      state.GC = msgObj.dataObj;
      //If mode has changed, update it here
      if(state.GC.GCMode != state.localModeObj.id){
        //BUT if we're loading playlist or level and GC is still stopped, don't change local mode
        if( !(state.GC.GCMode == STATE_MODE.Stopped.id &&
              (state.localModeObj == STATE_MODE.CHOOSE_PLAYLIST || state.localModeObj == STATE_MODE.CHOOSE_LEVEL)))
        {
          setModeById(state.GC.GCMode);
        }
        else {
          updateStateDisplayElements();
        }
      }
      else{
        //Do this to update regularly changing things like level time and score
        // even when there's no mode change
        updateStateDisplayElements();
      }
      
      break;
    case INCOMING_MESSAGES.ALL_PLAYLISTS:
      //Payload is array of playlist objects
      state.playlistData = msgObj.dataObj;
      break;
    case INCOMING_MESSAGES.CLOSING_CONNECTION:
      //GC is shutting things down
      Disconnect();
      break;
    case INCOMING_MESSAGES.DEFINES:
      break;
    case INCOMING_MESSAGES.ERROR:
      break;
    case INCOMING_MESSAGES.TEST_MESSAGE:
      break;
  }

}

function processDataChannelOpened(){
  Logger.log("*** main.processDataChannelOpened", true);
  //We have a conneciton. Now we wait for the first state from GC.
  setModeByObj(STATE_MODE.EXPECTING_GC_STATE);
}

function processDataChannelError(errString){
  Logger.error("*** main.processDataChannelError: " + errString, true);
  //TODO
}

//
function processDataChannelClose() {
  Logger.log("*** main.processDataChannelClose", true);
  //TODO
}

function processPeerDisconnect() {
  Logger.log("*** main.processPeerDisconnect", true);
  //TODO
}

function processSignalingDisconnect() {
  Logger.log('*** main.processSignalingDisconnect entered ---', true);
  // Based on sample project
  // Handles video player when connection is lost
  //Code that was here before is now in Disconnect so it can be called directly
  Disconnect();
}

////// END Video Player / DataChannel event handlers
/////////////////////////////////////////////////////

function Disconnect() {
  if(videoPlayer == null)
    return;

  const playerDiv = document.getElementById('player');
  clearChildren(playerDiv);
  //This closes peer connection and signaling connection
  videoPlayer.hangUp(connectionId);
  videoPlayer = null;
  connectionId = null;
  setModeByObj(STATE_MODE.PAIRING);    
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
  if (!videoPlayer) {
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