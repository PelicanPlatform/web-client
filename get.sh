curl -X POST https://localhost:8200/api/v1.0/issuer/token \
		-H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=NB2HI4DTHIXS63DPMNQWY2DPON2DUOBSGAYC6YLQNEXXMMJOGAXWS43TOVSXELZWMNTDIMLGGUZWGYLDGZRWCMLGGZSTKZRXMQZTCYLGGMYDANDBG47XI6LQMU6WC5LUNB5EO4TBNZ2CM5DTHUYTONJRGA2DOMRVG4YTMMZGOZSXE43JN5XD25RSFYYCM3DJMZSXI2LNMU6TSMBQGAYDA" \
  -d "code_verifier=b5624379868f7df00d7adfb312e43a5a71f0a62300c1dedcf782c270" \
  -d "redirect_uri=http://localhost:3000" \
  -d "client_id=oa4mp:/client_id/6a27624db90ccf7f56c04adb8a57ec93" \
  -d "client_secret=BE1z_SQlrwyzzzk-Lg5uh5f1p3TfV3v4" \
  --insecure