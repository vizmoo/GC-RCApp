let isDebug = false;

function getTimeString(){
  var d = new Date();
  return d.getHours() + ':' + d.getMinutes() + ':' + d.getSeconds();
}

export function enable() {
  isDebug = true;
}

export function disable() {
  isDebug = false;
}

export function debug(msg, separate=false, showTime=true) {
  if(!isDebug) return;
  if(separate) console.debug('---');
  //**NOTE** console.debug only outputs to console if browser 'Default levels' is set to Verbose (I believe)
  console.debug(msg + (showTime ? " - " + getTimeString() : ""));
  if(separate) console.debug('---');
}

export function info(msg) {
  isDebug && console.info(msg);
}

export function log(msg, separate=false, showTime=true) {
  if(!isDebug) return;
  if(separate) console.log('---');
  console.log(msg + (showTime ? " - " + getTimeString() : ""));
  if(separate) console.log('---');
}

export function warn(msg) {
  isDebug && console.warn(msg);
}

export function error(msg) {
  isDebug && console.error(msg);
}
