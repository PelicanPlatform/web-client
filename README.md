npm # Pelican Web Client

![Dynamic JSON Badge](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FPelicanPlatform%2Fweb-client%2Fmain%2F.github%2Fcoverage%2Fcoverage-summary.json&query=%24.total.statements.pct&label=Code%20Coverage&color=%23cfe4ff) ![Dynamic JSON Badge](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FPelicanPlatform%2Fweb-client%2Fmain%2F.github%2Ftests%2Ftest-summary.json&query=%24.numFailedTests&label=Failed%20Tests&color=%23abffae)

[NPM](https://www.npmjs.com/package/@pelicanplatform/web-client)
[Github](https://github.com/PelicanPlatform/web-client)

## Installation

```shell
npm i @pelicanplatform/web-client
```

## Usage

```javascript
import Client from "@pelicanplatform/web-client";

const discoveryUrl = "https://osg-htc.org"; // Example discovery URL used for OSDF
const filePath = "/example/file/path.txt"; // Example file path

const webClient = new Client(discoveryUrl);

try {
    webClient.getObject(filePath); // Downloads file to path.txt
} catch (e) {
    pass;
}
```

Example usage can be found here:

https://github.com/PelicanPlatform/web-client/blob/main/website/src/app/page.tsx
