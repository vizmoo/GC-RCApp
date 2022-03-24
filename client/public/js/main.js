import { VideoPlayer } from "./video-player.js";
import { registerGamepadEvents, registerKeyboardEvents, registerMouseEvents, sendClickEvent } from "./register-events.js";
import { getServerConfig } from "./config.js";

setup();

const textForConnectionId = document.getElementById('text_for_connection_id');

let playButton;
let videoPlayer;
let useWebSocket;
let connectionId;

const STATES = {
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

let selectedPlaylist;
let selectedLevel;

let currentState = STATES.UNHANDLED;
let videoEnabled = true;
let volumeValue = 100;
let scoreEnabled = true;
let scoreValue = 0;
let uiEnabled = true;

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
  showPlayButton();

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

  const chooseLevelButton = document.getElementById("chooseLevelButton")
  chooseLevelButton.addEventListener("click", function() {
    $('.ui.sidebar')
      .sidebar('show')
    ;
    const levelList = document.getElementById("levelList")
    currentState = STATES.CHOOSE_PLAYLIST
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
    if (currentState === STATES.CHOOSE_PLAYLIST) {
      $('.ui.sidebar')
        .sidebar('hide')
      ;
    } else if (currentState === STATES.CHOOSE_LEVEL) {
      currentState = STATES.CHOOSE_PLAYLIST
      const levelList = document.getElementById("levelList")
      levelList.innerHTML = ''
      PopulateList(levelList)
    }
  })

  const useSongSidebarButton = document.getElementById("useSongSidebarButton")
  useSongSidebarButton.addEventListener("click", function() {
    if (currentState === STATES.CHOOSE_PLAYLIST) {
      currentState = STATES.CHOOSE_LEVEL
      const levelList = document.getElementById("levelList")
      levelList.innerHTML = ''
      PopulateList(levelList)
    } else if (currentState === STATES.CHOOSE_LEVEL) {
      $('.ui.sidebar')
        .sidebar('hide')
      ;
      const levelName = document.getElementById("levelName")
      levelName.innerHTML = selectedLevel.name
      const songName = document.getElementById("songName")
      songName.innerHTML = selectedLevel.song
    }
  })
}

function setState(state) {
  
}

function PopulateList(levelList) {
  let listItems;
  if (currentState === STATES.CHOOSE_PLAYLIST) {
    listItems = samplePlaylists
  } else if (currentState === STATES.CHOOSE_LEVEL) {
    listItems = selectedPlaylist.levels;
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

    const levelOnly = document.getElementsByClassName("levelOnly")
    for (var i = 0; i < levelOnly.length; i++) {
      levelOnly[i].style.display = (currentState === STATES.CHOOSE_LEVEL) ? "block" : "none"
    }

    listButton.addEventListener("click", function() {
      if (currentState === STATES.CHOOSE_PLAYLIST) {
        selectedPlaylist = item;
      } else if (currentState === STATES.CHOOSE_LEVEL) {
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

function showPlayButton() {
  if (!document.getElementById('playButton')) {
    let elementPlayButton = document.createElement('img');
    elementPlayButton.id = 'playButton';
    elementPlayButton.src = 'images/Play.png';
    elementPlayButton.alt = 'Start Streaming';
    playButton = document.getElementById('player').appendChild(elementPlayButton);
    playButton.addEventListener('click', onClickPlayButton);
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

  // add blue button
  const elementBlueButton = document.createElement('button');
  elementBlueButton.id = "blueButton";
  elementBlueButton.innerHTML = "Light on";
  playerDiv.appendChild(elementBlueButton);
  elementBlueButton.addEventListener("click", function () {
    console.log("blue clicked")
    sendClickEvent(videoPlayer, 1);
  });

  // add green button
  const elementGreenButton = document.createElement('button');
  elementGreenButton.id = "greenButton";
  elementGreenButton.innerHTML = "Light off";
  playerDiv.appendChild(elementGreenButton);
  elementGreenButton.addEventListener("click", function () {
    console.log("green clicked")
    sendClickEvent(videoPlayer, 2);
  });

  // add orange button
  const elementOrangeButton = document.createElement('button');
  elementOrangeButton.id = "orangeButton";
  elementOrangeButton.innerHTML = "Play audio";
  playerDiv.appendChild(elementOrangeButton);
  elementOrangeButton.addEventListener("click", function () {
    console.log("orange clicked")
    sendClickEvent(videoPlayer, 3);
  });

  // add red button
  const elementRedButton = document.createElement('button');
  elementRedButton.id = "redButton";
  elementRedButton.innerHTML = "Toggle Red";
  playerDiv.appendChild(elementRedButton);
  elementRedButton.addEventListener("click", function () {
    console.log("red clicked")
    sendMessageJSON(videoPlayer, "hello my name is jason");
  });

  // add fullscreen button
  const elementFullscreenButton = document.createElement('img');
  elementFullscreenButton.id = 'fullscreenButton';
  elementFullscreenButton.src = 'images/FullScreen.png';
  playerDiv.appendChild(elementFullscreenButton);
  elementFullscreenButton.addEventListener("click", function () {
    if (!document.fullscreenElement || !document.webkitFullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
      }
      else if (document.documentElement.webkitRequestFullscreen) {
        document.documentElement.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
      } else {
        if (playerDiv.style.position == "absolute") {
          playerDiv.style.position = "relative";
        } else {
          playerDiv.style.position = "absolute";
        }
      }
    }
  });
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);
  document.addEventListener('fullscreenchange', onFullscreenChange);

  function onFullscreenChange() {
    if (document.webkitFullscreenElement || document.fullscreenElement) {
      playerDiv.style.position = "absolute";
      elementFullscreenButton.style.display = 'none';
    }
    else {
      playerDiv.style.position = "relative";
      elementFullscreenButton.style.display = 'block';
    }
  }

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