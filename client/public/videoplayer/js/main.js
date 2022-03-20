import React from 'react';
import ReactDOM from 'react-dom';
import { VideoPlayer } from "./video-player.js";
import { registerGamepadEvents, registerKeyboardEvents, registerMouseEvents, sendClickEvent } from "./register-events.js";
import { getServerConfig } from "./config.js";

// window.document.oncontextmenu = function () {
//   return false;     // cancel default menu
// };

// window.addEventListener('resize', function () {
//   videoPlayer.resizeVideo();
// }, true);

// window.addEventListener('beforeunload', async () => {
//   await videoPlayer.stop();
// }, true);

class Button extends React.Component {
  render() {
    return(
      <div>
        <button id={this.props.id} onClick={this.props.onClick}>{this.props.text}</button>
      </div>
    )
  }
}

class ConnectionID extends React.Component {
    render() {
        return(
            <p>ConnectionID:<br />
                <textarea id="text_for_connection_id"></textarea>
            </p>
        )
    }
}

class App extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            connectionId: null,
            videoPlayer: null,
            useWebSocket: null,
            renderControls: false,
        }
        this.setUp = this.setUp.bind(this)
        this.setupVideoPlayer = this.setupVideoPlayer.bind(this)
        this.hangUp = this.hangUp.bind(this)
    }

    setUp() {

        const res = getServerConfig();
        this.setState({ useWebSocket: res.useWebSocket })
        this.showWarningIfNeeded(res.startupMode);

        // Nullify Setup Button
        document.getElementById("setUp").disabled = true;
        document.getElementById("hangUp").disabled = false;

        //Pull Connection ID
        const cid = document.getElementById('text_for_connection_id').value;
        this.setState({ connectionId: cid });

        // add video player to player div
        const playerDiv = document.getElementById('player');
        const elementVideo = document.createElement('video');
        elementVideo.id = 'Video';
        elementVideo.style.touchAction = 'none';
        playerDiv.appendChild(elementVideo);

        // call setupVideoPlayer()
        this.setupVideoPlayer([elementVideo]).then(value => this.setState({ videoPlayer: value }));

        // add blue, green, orange, and fullscreen buttons
        this.setState({ renderControls: true })
    }

    async setupVideoPlayer(elements) {
        const videoPlayer = new VideoPlayer(elements);
        await videoPlayer.setupConnection(this.state.connectionId, this.state.useWebSocket);
      
        videoPlayer.ondisconnect = this.hangUp;
        registerGamepadEvents(videoPlayer);
        registerKeyboardEvents(videoPlayer);
        registerMouseEvents(videoPlayer, elements[0]);
      
        return videoPlayer;
    }

    showWarningIfNeeded(startupMode) {
        const warningDiv = document.getElementById("warning");
        if (startupMode == "private") {
          warningDiv.innerHTML = "<h4>Warning</h4> This sample is not working on Private Mode.";
          warningDiv.hidden = false;
        }
      }

    hangUp() {
        this.state.videoPlayer.hangUpConnection(this.state.connectionId);
        this.setState({
            connectionId: null,
            videoPlayer: null,
            renderControls: false,
        })        
        document.getElementById("setUp").disabled = false;
        document.getElementById("hangUp").disabled = true;
    }

    handleFullscreen() {
        const playerDiv = document.getElementById('player');
        const elementFullscreenButton = document.getElementById('fullscreenButton');
        if (!document.fullscreenElement || !document.webkitFullscreenElement) {
            if (document.documentElement.requestFullscreen) {
              document.documentElement.requestFullscreen();
            }
            else if (document.documentElement.webkitRequestFullscreen) {
              document.documentElement.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
            } else {
              if (playerDiv.style.position === "absolute") {
                playerDiv.style.position = "relative";
              } else {
                playerDiv.style.position = "absolute";
              }
            }
        }

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

    render() {
        const appLayout = []
        const playerLayout = []

        appLayout.push(<h1>GC RCApp</h1>)
        appLayout.push(<div id="warning" hidden={true}></div>)
        
        appLayout.push(<ConnectionID />)
        appLayout.push(<Button id="setUp" text="Set Up" onClick={this.setUp} />)
        appLayout.push(<Button id="hangUp" text="Hang Up" onClick={this.hangUp} />)

        if (this.state.renderControls) {
            playerLayout.push(<Button id="blueButton" type='text' text="Light On" onClick={sendClickEvent(this.state.videoPlayer, 1)} />)
            playerLayout.push(<Button id="greenButton" type='text' text="Light Off" onClick={sendClickEvent(this.state.videoPlayer, 2)} />)
            playerLayout.push(<Button id="orangeButton" type='text' text="Play Sound" onClick={sendClickEvent(this.state.videoPlayer, 3)} />)
            playerLayout.push(<Button id="fullscreenButton" type='image' image="images/fullscreen.png" onClick={this.handleFullscreen} />)
        }

        return(
        <div id="container">
            {appLayout}
            <div id="player">
                {playerLayout}
            </div>
        </div>
        )
    }
}

ReactDOM.render(<App/>, document.getElementById('root'));