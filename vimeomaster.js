const fs = require("fs");
const url = require("url");
const https = require("https");
const request = require("request");
const log = (...args) => console.log("→", ...args);
const config = require("./videojson.js");
const promises = [];

const list = config.list
const proxy = config.proxy

let index = -1;

function loadVideo(obj,cb) {
  let masterUrl = obj.url;
  if (!masterUrl.endsWith("?base64_init=1")) {
    masterUrl += "?base64_init=1";
  }

  getJson(masterUrl, (err, json) => {
    log("Fetching JSON...")
    if (err) {
      return cb(err);
    }

    const videoData = json.video
      .sort((v1, v2) => v1.avg_bitrate - v2.avg_bitrate)
      .pop();
    const audioData = json.audio
      .sort((a1, a2) => a1.avg_bitrate - a2.avg_bitrate)
      .pop();

    const videoBaseUrl = url.resolve(
      url.resolve(masterUrl, json.base_url),
      videoData.base_url
    );
    const audioBaseUrl = url.resolve(
      url.resolve(masterUrl, json.base_url),
      audioData.base_url
    );

    processFile(
      "video",
      videoBaseUrl,
      videoData.init_segment,
      videoData.segments,
      obj.name + ".m4v",
      err => {
        if (err) {
          return cb(err);
        }

        processFile(
          "audio",
          audioBaseUrl,
          audioData.init_segment,
          audioData.segments,
          obj.name + ".m4a",
          err => {
            if (err) {
              return cb(err);
            }

            // Call next video
            cb(null);
          }
        );
      }
    );
  });
}

function processFile(type, baseUrl, initData, segments, filename, cb) {
  const filePath = `./parts/${filename}`;
  const downloadingFlag = `./parts/.${filename}~`;
  
  if(fs.existsSync(downloadingFlag)) {
    log("⚠️", ` ${filename} - ${type} is incomplete, restarting the download`);
  } else if (fs.existsSync(filePath)) {
    log("⚠️", ` ${filename} - ${type} already exists`);
    return cb();
  } else {
    fs.writeFileSync(downloadingFlag, '');
  }

  const segmentsUrl = segments.map(seg => baseUrl + seg.url);

  const initBuffer = Buffer.from(initData, "base64");
  fs.writeFileSync(filePath, initBuffer);

  const output = fs.createWriteStream(filePath, {
    flags: "a"
  });

  combineSegments(type, 0, segmentsUrl, output, filePath, downloadingFlag, err => {
    if (err) {
      log("⚠️", ` ${err}`);
    }

    output.end();
    cb();
  });
}

function combineSegments(type, i, segmentsUrl, output, filename, downloadingFlag, cb) {
  if (i >= segmentsUrl.length) {
    fs.unlinkSync(downloadingFlag);
    log("🏁", ` ${filename} - ${type} done`);
    return cb();
  }

  log(
    "📦",
    type === "video" ? "📹" : "🎧",
    `Downloading ${type} segment ${i}/${segmentsUrl.length} of ${filename}`
  );

  // https
  //   .get(segmentsUrl[i], res => {
  //     res.on("data", d => output.write(d));

  //     res.on("end", () =>
  //       combineSegments(type, i + 1, segmentsUrl, output, filename, downloadingFlag, cb)
  //     );
  //   })
  //   .on("error", e => {
  //     cb(e);
  //   });
  request
  .get({
    'url':segmentsUrl[i],
    'method':'GET',
    'proxy':proxy ? proxy : null
  })
  .on("data", d => output.write(d))
  .on("end", () =>
    combineSegments(type, i + 1, segmentsUrl, output, filename, downloadingFlag, cb)
  )
  .on("error", e => {
    cb(e);
  })
}

function getJson(url, cb) {
  let data = "";

  // https
  //   .get(url, res => {
  //     res.on("data", d => (data += d));

  //     res.on("end", () => cb(null, JSON.parse(data)));
  //   })
  //   .on("error", e => {
  //     cb(e);
  //   });
  request
  .get({
    'url':url,
    'method':'GET',
    'proxy':proxy ? proxy : null
  })
  .on("data", d => (data += d))
  .on("end", () => cb(null, JSON.parse(data)))
  .on("error", e => {
    cb(e);
  });

}

function initJs(obj = null) {
  loadVideo(obj, (err) => {
    if (err) {
      log("⚠️", ` ${err}`);
      return;
    }

    let v = getNextVideo()
    // Before next video
    if (v) {
      initJs();
    }
  });
}


function getNextVideo(){
  index+=1;
  return list[index]
}

let obj = getNextVideo()
if(obj){
  initJs(obj);
}
