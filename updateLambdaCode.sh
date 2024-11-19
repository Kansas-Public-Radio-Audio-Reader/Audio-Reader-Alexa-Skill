#!/bin/bash

rm arAlexaSkillFunction.zip
zip -r arAlexaSkillFunction.zip .
echo "zipping package complete"
echo "now sending to AWS..."
aws lambda update-function-code --function-name playAudioReader --zip-file fileb://arAlexaSkillFunction.zip
echo "finished."
echo "DON'T FORGET TO CREATE A NEW LAMBDA VERSION AND UPDATE THE LIVE ALIAS TO THE NEW VERSION"
