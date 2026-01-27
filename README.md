# whatsapp-deleter
Always wanted to block specific people in Whatsapp? This is kinda of the thing
This deletes specific people messages in groups

In order to configure the numbers you'd like to be deleted, 
edit the following field in `start` script:
`export TARGET_NUMBERS=""`, numbers should be seperated with comma.

After the app started, run 
`npm run logs` or 
`pm2 logs --lines 50 --time`

There will be printed a QR code and the URL for the QR code.
The code should be scanned inside the whatsapp device as explained [here](https://faq.whatsapp.com/1317564962315842/?cms_platform=android)
If the QR can't be scanned, the URL should be pasted into a browser and there you will have am image of the QR that should be easily scanned.


## install
npm install

## run
./start

## logs
pm2 logs --lines 50 --time


