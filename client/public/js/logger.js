let isDebug = false;

export function enable() {
  isDebug = true;
}

export function disable() {
  isDebug = false;
}

export function debug(msg, separate=false) {
  if(!isDebug) return;
  if(separate) console.debug('---');
  //**NOTE** console.debug only outputs to console if browser 'Default levels' is set to Verbose (I believe)
  console.debug(msg);
  if(separate) console.debug('---');
}

export function info(msg) {
  isDebug && console.info(msg);
}

export function log(msg, separate=false) {
  if(!isDebug) return;
  if(separate) console.log('---');
  console.log(msg);
  if(separate) console.log('---');
}

export function warn(msg) {
  isDebug && console.warn(msg);
}

export function error(msg) {
  isDebug && console.error(msg);
}
