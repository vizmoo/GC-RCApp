export async function getServerConfig() {
  const protocolEndPoint = location.origin + '/config';
  const createResponse = await fetch(protocolEndPoint);
  return await createResponse.json();
}

export function getRTCConfiguration() {
  let config = {};
  config.sdpSemantics = 'unified-plan';
  config.iceServers = [
    { 
      username: 'username',
      credential: 'password',
      urls: ['turn:44.202.27.83:3478?transport=tcp'] 
    }
  ];
  return config;
}