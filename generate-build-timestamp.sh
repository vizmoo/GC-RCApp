#!/bin/sh
#Generate a simple timestamp file that gets picked up in subsequent
# build step to get included in the web app
#Use UTC time so it's always the same between local and AWS server
FIL="client/public/js/build_timestamp.js"
echo Generating timestamp $FIL
echo "//Genereated at build time via package.json and local script $0" > $FIL
echo export const BUILD_TIMESTAMP = \"`date -u +%F-%H-%M`\" >> $FIL
