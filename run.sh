#!/bin/bash
# Build and run the signal server and web-app server
# 10/2022
# The "-- -w" arguments are key to get it to run with websockets mode
# I don't know what the run.bat script is supposed to do, but
#   I don't use it
npm run build; npm run start -- -w
