#!/usr/bin/env node

"use strict";

var assert = require('assert'),
    dns = require('dns'),
    fs = require('fs'),
    path = require('path'),
    http = require('http'),
    querystring = require('querystring');

var less = require('less'),
    config = require('./config').config;

var USE_LOCAL = true,
    USE_PRE = false,
    IP_PRE = '110.75.14.33',
    IP_PUB,
    PUB_SRV = 'assets.gslb.taobao.com',
    MIME = {
        js: 'application/x-javascript',
        css: 'text/css',
        txt: 'text/plain',
        png: 'image/png',
        gif: 'image/gif',
        jpg: 'image/jpeg',
        swf: 'application/x-shockwave-flash'
    };

var lessparser;

function getIp(cb) {//{{{
    dns.resolve4(PUB_SRV, function (err, addresses) {
        if (err) {
            assert(!err, 'Can\'t connect to ' + PUB_SRV);
        }

        IP_PUB = addresses[0];
        console.log('[status] pub server: ' + IP_PUB);
        cb();
    });
}//}}}

function setStatus(req, res) {//{{{
    req.setEncoding('utf8');

    var formData = '';
    req.on('data', function (data) {
        formData += data;
    });
    req.on('end', function (data) {
        console.log('[status]' + formData);

        formData = querystring.parse(formData);
        USE_LOCAL = formData.on === 'true';
        USE_PRE = formData.is_pre === 'true';

        getStatus(req, res);
    });
}//}}}

function getStatus(req, res) {//{{{
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end('<!doctype html><meta charset="utf-8"><title>CDN Proxy</title>' +
            '<form method="post">' +
                '<div class="control-group">' +
                    '<label class="control-label">本地代理开关</label>' +
                    '<div class="controls">' +
                        '<label class="radio"><input type="radio" name="on" value="true"' + (USE_LOCAL ? ' checked' : '') + '>开</label>' +
                        '<label class="radio"><input type="radio" name="on" value="false"' + (USE_LOCAL ? '' : ' checked') + '>关</label>' +
                    '</div>' +
                '</div>' +
                '<div class="control-group">' +
                    '<label class="control-label">远程文件地址：预发/线上</label>' +
                    '<div class="controls">' +
                        '<label class="radio"><input type="radio" name="is_pre" value="true"' + (USE_PRE ? ' checked' : '') + '>预发</label>' +
                        '<label class="radio"><input type="radio" name="is_pre" value="false"' + (USE_PRE ? '' : ' checked') + '>线上</label>' +
                    '</div>' +
                '</div>' +
                '<button type="submit">提交</button>' +
            '</form>');
}
//}}}

function proxy(req, res) {//{{{
    var files = parse(req.url);
    console.log('[list] ' + files);

  if(req.url.indexOf('_build_less_') > -1){
    req._build_less_ = true;
  }
    getFiles(files,
        function gotAll(fileContents) {
            // 不能直接取1
            // file: p/global/1.0/global-min.css 会出现bug

          var suffix = files[0].split('.').pop();

            res.writeHead(200, {'Content-Type': MIME[suffix] || MIME.txt});
            fileContents.forEach(function (file) {
                res.write(file);
            });
            res.end();
        },
        function doh(err) {
            res.writeHead(200, {'Content-Type': MIME.txt});
            res.end(err.message);
        },
             req,res
    );
}//}}}

function parse(url) {//{{{
    var ret = [],
        combo = url.indexOf('??'),
        base, files;

    if (-1 !== combo) {
        base = url.slice(0, combo);
        files = url.slice(combo + 2);

        files = files.split('?')[0];
        files = files.split('#')[0];

        files = files.split(',');

        files.forEach(function (file) {
            ret.push(base + file);
        });
    } else {
        url = url.split('?')[0];
        url = url.split('#')[0];
        ret.push(url);
    }

    return ret;
}//}}}

function getFiles(files, success, fail,req,res) {//{{{
    var len = files.length,
        rets = [];

    function cb(index) {
        return function set(ret) {
            if (ret instanceof Error) {
                fail(ret);
            } else {
                rets[index] = ret;

                var k = len,
                    finished = true;
                while (finished && k--) {
                    finished = finished && undefined !== rets[k];
                }

                if (finished) {
                    success(rets);
                }
            }
        };
    }

    files.forEach(function (file, index) {
        getFile(file, cb(index),req,res);
    });
}//}}}

function getFile(file, cb,req,res) {//{{{
    if (USE_LOCAL) {
        getLocal(file,function(a,tree){
                        if (tree) {
                          var css = tree.toCSS({ compress: false });
                          if(req._build_less_){
                            var ret = file.replace('.css',config.lessBuildExtension || '.source.css');
                            fs.writeFile("."+ret,css,function(err){
                              if(err)throw Error(err);
                              console.log('[build less]'+file);
                            });
                          }
                          cb(css);
                        }else{
                          if(a){
                            cb(a);
                          }else{
                            getRemote(file, cb);
                          }
                        }
                      },req,res);
    } else {
        getRemote(file, cb,req,res);
    }
}//}}}

function getRemote(file, cb,req,res) {//{{{
    http.get({
        headers: {
            host: 'a.tbcdn.cn'
        },
        host: USE_PRE ? IP_PRE : IP_PUB,
        port: 80,
        path: file
    }, function (res) {
        var fileBuffer,
            buffers = [],
            size = 0;

        res.on('data', function (data) {
            size += data.length;
            buffers.push(data);
        });
        res.on('end', function () {
            var p = 0;

            fileBuffer = new Buffer(size);
            buffers.forEach(function (buffer) {
                var len = buffer.length;
                buffer.copy(fileBuffer, p, 0, len);
                p += len;
            });
            cb(fileBuffer);
            console.log('[remote] got ' + file);
        });
    }).on('error', function (e) {
        cb(new Error('File not found: ' + file));
        console.log('[remote] not got ' + file);
    });
}//}}}

function getLocal(file,cb,req,res) {//{{{
    var ret,
        pre,
        idx,
        lessfile,
        filename = "."+file;

  idx = file.indexOf('.css');
  pre = file.slice(0,idx);
  lessfile = "."+pre+'.less';

  if(idx>-1){
    path.exists(lessfile,function(b){
      if(b){
        fs.readFile(lessfile,function(err,data){
          console.log("[local]"+lessfile);
          data = data.toString();
          var lesslibpath =  [path.dirname(lessfile)].concat('.');
          console.log("less lib path:",lesslibpath);
          lessparser = lessparser || new(less.Parser)({
            paths: lesslibpath
          });
          lessparser.parse(data,cb)
        });
      }else{
        path.exists(filename,function(b){
          if(b){
            console.log("[local]"+filename);
            fs.readFile(filename,function(err,data){
              cb(data);
            });
          }else{
            cb(null);
          }
        });
      }
    })
  }else{
    path.exists(filename,function(b){
      if(b){
        console.log("[local]"+filename);
        fs.readFile(filename,function(err,data){
          cb(data);
        });
      }else{
        cb(null);
      }
    });
  }
  /* 下面是同步阻塞方案，很慢，改成上面的异步的，快乐很多 */

  // if(idx>-1 && path.existsSync(lessfile)){
  //   console.log('[local] found ' + file);
  //   var data = fs.readFileSync(lessfile).toString();
  //   lessparser = lessparser || new(less.Parser)({
  //     paths: ['.']
  //   });
  //   lessparser.parse(data,cb)
  // }else{
  //   try {
  //       ret = fs.readFileSync('.' + file);
  //       console.log('[local] found ' + file);
  //       cb(ret);
  //   } catch (e) {
  //       ret = null;
  //       console.log('[local] not found ' + file);
  //       cb(ret);
  //   }
  // }

}//}}}

getIp(function () {//{{{
    http.createServer(function (req, res) {
        if (req.method === 'POST') {
            setStatus(req, res);
        } else if (req.url === '/') {
            getStatus(req, res);
        } else {
            proxy(req, res);
        }
    }).listen(80);
});//}}}
