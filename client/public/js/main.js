import { VideoPlayer } from "./video-player.js";
import { registerGamepadEvents, registerKeyboardEvents, registerMouseEvents, sendClickEvent } from "./register-events.js";
import { getServerConfig } from "./config.js";

setup();

const textForConnectionId = document.getElementById('text_for_connection_id');

let playButton;
let videoPlayer;
let useWebSocket;
let connectionId;

const STATE = {
  PAIRING: "Pairing",
  CATCHING: "Catching",
  STOPPED: "Stopped",
  CHOOSE_PLAYLIST: "Choose Playlist",
  CHOOSE_LEVEL: "Choose Level",
  LEVEL_START: "Level Start",
  CALIBRATING: "Calibrating",
  LOADING: "Loading",
  PAUSED: "Paused",
  SYSTEM_MENU: "System Menu",
  UNHANDLED: "Unhandled"
}

let samplePlaylists = [
{
  name: "Cool Playlist",
  creator: "Bungo Sprungo",
  date: "09/04/2000",
  notes: "This is not a real playlist",
  levels: [
    {
      name: "Cool Song",
      difficulty: "Medium",
      song: "10 Minutes of Microwaves Beeping",
      creator: "MicrowaveFan444",
      date: "04/13/2009",
      notes: "WARNING: There will be microwaves"
    },
    {
      name: "Cooler Song",
      difficulty: "Hard",
      song: "Mary Had a Little Lamb (Xylophone Cover)",
      creator: "TimothyAge5",
      date: "02/10/2017",
      notes: "His first cover :)"
    },
    {
      name: "Coolest Song",
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
      name: "Lame Song",
      difficulty: "Easy",
      song: "Silence 10 Hours",
      creator: "fan_of_boring_things_1993",
      date: "12/32/9999",
      notes: "Boring as hell :/"
    }
  ]
}
]

let selectedPlaylist = null;
let selectedLevel = null;

let currentState;
let videoEnabled = true;
let volumeValue = 100;
let scoreEnabled = true;
let scoreValue = 0;
let uiEnabled = true;
let seatedMode = false;

window.document.oncontextmenu = function () {
  return false;     // cancel default menu
};

window.addEventListener('resize', function () {
  videoPlayer.resizeVideo();
}, true);

window.addEventListener('beforeunload', async () => {
  await videoPlayer.stop();
}, true);

async function setup() {
  const res = await getServerConfig();
  useWebSocket = res.useWebSocket;
  setState(STATE.PAIRING);
  controlTopbar.style.backgroundColor = "black";
  videoArea.style.backgroundColor = "black";

  const videoToggleButton = document.getElementById("videoToggleButton")
  const videoToggleText = document.getElementById("videoToggleText")
  videoToggleButton.addEventListener("click", function () {
    videoEnabled = !videoEnabled
    videoToggleText.innerHTML = videoEnabled ? "Video On" : "Video Off"
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

  $('.ui.slider')
  .slider({
    min: 0,
    max: 100,
    start: 100,
    step: 1,
    onChange: function (e,v) {
      volumeValue = v
      const volumeText = document.getElementById("volumeText")
      volumeText.innerHTML = "Vol " + volumeValue
    }
  })

  const scoreToggleButton = document.getElementById("scoreToggleButton")
  const scoreToggleText = document.getElementById("scoreToggleText")
  scoreToggleButton.addEventListener("click", function () {
    scoreEnabled = !scoreEnabled
    let toggleText = scoreEnabled ? "Visible" : "Hidden"
    scoreToggleText.innerHTML = "Score " + toggleText + " " + scoreValue
  });

  const uiToggleButton = document.getElementById("uiToggleButton")
  const uiToggleText = document.getElementById("uiToggleText")
  uiToggleButton.addEventListener("click", function () {
    uiEnabled = !uiEnabled
    uiToggleText.innerHTML = uiEnabled ? "UI On" : "UI Off"
  });

  const forceCancelButton = document.getElementById("forceCancelButton")
  forceCancelButton.addEventListener("click", function () {
    setState(STATE.STOPPED)
  })

  const startCasualButton = document.getElementById("startCasualButton")
  startCasualButton.addEventListener("click", function () {
    setState(STATE.CATCHING)
  })

  const startCompetitiveButton = document.getElementById("startCompetitiveButton")
  startCompetitiveButton.addEventListener("click", function () {
    setState(STATE.CATCHING)
  })

  const cancelStartButton = document.getElementById("cancelStartButton")
  cancelStartButton.addEventListener("click", function () {
    setState(STATE.STOPPED)
  })

  const pauseButton = document.getElementById("pauseButton")
  pauseButton.addEventListener("click", function () {
    setState(STATE.PAUSED)
  })

  const pauseResumeButton = document.getElementById("pauseResumeButton")
  pauseResumeButton.addEventListener("click", function () {
    setState(STATE.CATCHING)
  })

  const pauseRestartButton = document.getElementById("pauseRestartButton")
  pauseRestartButton.addEventListener("click", function () {
    setState(STATE.LEVEL_START)
  })

  const pauseQuitButton = document.getElementById("pauseQuitButton")
  pauseQuitButton.addEventListener("click", function () {
    setState(STATE.STOPPED)
  })

  const replayLevelButton = document.getElementById("replayLevelButton")
  replayLevelButton.addEventListener("click", function () {
    setState(STATE.CALIBRATING)
  })

  const seatedToggleButton = document.getElementById("seatedToggleButton")
  const seatedToggleText = document.getElementById("seatedToggleText")
  seatedToggleButton.addEventListener("click", function () {
    seatedMode = !seatedMode
    seatedToggleText.innerHTML = seatedMode ? "Seated Mode On" : "Seated Mode Off"
  })

  const calibratingCancelButton = document.getElementById("calibratingCancelButton")
  calibratingCancelButton.addEventListener("click", function () {
    setState(STATE.STOPPED)
  })

  //--------BEGIN DEBUG BUTTONS---------
  const goToLoading = document.getElementById("goToLoading")
  goToLoading.addEventListener("click", function () {
    setState(STATE.LOADING)
  })

  const goToLevelStart = document.getElementById("goToLevelStart")
  goToLevelStart.addEventListener("click", function () {
    setState(STATE.LEVEL_START)
  })

  const endLevel = document.getElementById("endLevel")
  endLevel.addEventListener("click", function () {
    setState(STATE.STOPPED)
  })

  const goToSystemMenu = document.getElementById("goToSystemMenu")
  goToSystemMenu.addEventListener("click", function () {
    setState(STATE.SYSTEM_MENU)
  })

  const goToUnhandled = document.getElementById("goToUnhandled")
  goToUnhandled.addEventListener("click", function () {
    setState(STATE.UNHANDLED)
  })

  const goToStopped = document.getElementById("goToStopped")
  goToStopped.addEventListener("click", function () {
    setState(STATE.STOPPED)
  })
  //--------END DEBUG BUTTONS---------

  const chooseLevelButton = document.getElementById("chooseLevelButton")
  chooseLevelButton.addEventListener("click", function() {
    $('.ui.sidebar')
      .sidebar('show')
    ;
    const levelList = document.getElementById("levelList")
    setState(STATE.CHOOSE_PLAYLIST)
    PopulateList(levelList)    
  })

  $('.ui.sidebar').sidebar(
  {
    dimPage: false,
    transition: 'overlay',
    exclusive: false,
    closable: false,
    onHidden: function(){
      const levelList = document.getElementById("levelList")
      levelList.innerHTML = ''
      document.getElementById("detailsCreator").innerHTML = "Creator: "
      document.getElementById("detailsDate").innerHTML = "Date Modified: "
      document.getElementById("detailsNotes").innerHTML = "Notes: "
    }
  })

  const closeSidebarButton = document.getElementById("closeSidebarButton")
  closeSidebarButton.addEventListener("click", function() {
    if (currentState === STATE.CHOOSE_PLAYLIST) {
      $('.ui.sidebar')
        .sidebar('hide')
      ;
      setState(STATE.STOPPED)
    } else if (currentState === STATE.CHOOSE_LEVEL) {
      setState(STATE.CHOOSE_PLAYLIST)
      const levelList = document.getElementById("levelList")
      levelList.innerHTML = ''
      PopulateList(levelList)
    }
  })

  const useSongSidebarButton = document.getElementById("useSongSidebarButton")
  useSongSidebarButton.addEventListener("click", function() {
    if (currentState === STATE.CHOOSE_PLAYLIST && selectedPlaylist !== null) {
      setState(STATE.CHOOSE_LEVEL)
      const levelList = document.getElementById("levelList")
      levelList.innerHTML = ''
      PopulateList(levelList)
    } else if (currentState === STATE.CHOOSE_LEVEL && selectedLevel !== null) {
      $('.ui.sidebar')
        .sidebar('hide')
      ;
      const levelName = document.getElementById("levelName")
      levelName.innerHTML = selectedLevel.name
      const songName = document.getElementById("songName")
      songName.innerHTML = selectedLevel.song
      setState(STATE.CALIBRATING)
    }
  })
}

function setState(state) {
  currentState = state;
  const stateText = document.getElementById("stateText");
  stateText.innerHTML = currentState;
  updateElementVisibility()
}

function updateElementVisibility() {
  const stateElements = document.getElementsByClassName("STATE")
  for (var i = 0; i < stateElements.length; i++) {
    const element = stateElements[i]
    const stateClass = getKeyByValue(STATE, currentState)
    element.style.display = (element.classList.contains(stateClass)) ? "flex" : "none"
  }
  const hideStateElements = document.getElementsByClassName("HIDESTATE")
  for (var i = 0; i < hideStateElements.length; i++) {
    const element = hideStateElements[i]
    const hideStateClass = getKeyByValue(STATE, currentState)
    console.log(element)
    console.log(hideStateClass)
    console.log(element)
    element.style.visibility = (element.classList.contains(hideStateClass)) ? "hidden" : "visible"
  }
}

function getKeyByValue(object, value) {
  return Object.keys(object).find(key => object[key] === value);
}

function PopulateList(levelList) {
  let listItems;
  if (currentState === STATE.CHOOSE_PLAYLIST) {
    listItems = samplePlaylists
    document.getElementById("chooseLevelText").innerHTML = "Choose a Playlist"
    document.getElementById("closeSidebarButton").innerHTML = "Cancel"
    document.getElementById("detailsTitle").innerHTML = "Playlist Details"
  } else if (currentState === STATE.CHOOSE_LEVEL) {
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
      if (currentState === STATE.CHOOSE_PLAYLIST) {
        selectedPlaylist = item;
      } else if (currentState === STATE.CHOOSE_LEVEL) {
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

function showWarningIfNeeded(startupMode) {
  const warningDiv = document.getElementById("warning");
  if (startupMode == "private") {
    warningDiv.innerHTML = "<h4>Warning</h4> This sample is not working on Private Mode.";
    warningDiv.hidden = false;
  }
}

function onClickPlayButton() {

  playButton.style.display = 'none';

  connectionId = textForConnectionId.value;

  const playerDiv = document.getElementById('player');

  // add video player
  const elementVideo = document.createElement('video');
  elementVideo.id = 'Video';
  elementVideo.style.touchAction = 'none';
  playerDiv.appendChild(elementVideo);

  // add video thumbnail
  const elementVideoThumb = document.createElement('video');
  elementVideoThumb.id = 'VideoThumbnail';
  elementVideoThumb.style.touchAction = 'none';
  playerDiv.appendChild(elementVideoThumb);

  setupVideoPlayer([elementVideo, elementVideoThumb]).then(value => videoPlayer = value);

}

async function setupVideoPlayer(elements) {
  const videoPlayer = new VideoPlayer(elements);
  await videoPlayer.setupConnection(connectionId, useWebSocket);

  videoPlayer.ondisconnect = onDisconnect;
  registerGamepadEvents(videoPlayer);
  registerKeyboardEvents(videoPlayer);
  registerMouseEvents(videoPlayer, elements[0]);

  return videoPlayer;
}

function onDisconnect() {
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

function sendMessageJSON(videoPlayer, msg) {
  let obj = {
    "message": msg,
    "timestamp": new Date()
  }
  videoPlayer && videoPlayer.sendMsg(JSON.stringify(obj));
}