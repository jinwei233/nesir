Mr Ness
=========================
* 一堆前缀 -web-kit -moz -o -khtml -ms 很烦，用less吧
* 可是……每次写完less都要重新编译，也很烦，是不是
* 那么，用Mr Ness吧

安装步骤
--------
* step1
如果cdn地址为 http://example.cdn.com/app/css/main.css
在c:/Windows/System32/drivers/etc/host添加一行

    127.0.0.1 example.cdn.com
* step2
  当前路径比如在F:/site/

    git clone git@github.com:WeweTom/nesir.git

* step3
新建一个与你的cdn路径相对应的文件夹app，现在你的目录结构大概是这样的

    ├── app
    │   ├── main.css
    │   └── main.less
    ├── config.js
    ├── less
    │   └── lib.less
    ├── lib
    │   ├── node.exe
    │   └── node_modules
    ├── proxy.js
    ├── README.md
    └── run.cmd

* step4
  进入命令行执行下面命令 (运行前确认你的80端口没有被占用)

    run.cmd


现在所有线上的example.cdn.com的资源都代理到本地了

预编译less
----------
稍大一点的网站都是用独立域名的cdn来放静态资源文件的

    <html>
      <head>
        <link href="http://example.cdn.com/app/css/main.css"/>
      </head>
      <body>
        some more snippet
      </body>
    </html>

前端在做demo的时候需要模拟cdn环境，也就是说资源路径也要是cdn资源路径，我们可以通过配置host来指向本机，nesir本身即是一个代理

当你访问 http://example.cdn.com/app/css/main.css
nesir会检查 http://example.cdn.com/app/css/main.less 存在否，如果存在，则返回main.less编译后的结果

这样在开发时，就能边写less，边查看demo效果啦

当demo开发完毕后，最终上线的代码还是必须为css，这时候就需要将main.less的结果编译为main.css，这样来编译
http://example.cdn.com/app/css/main.css?_build_less_
nesir会就会将main.less编译后的结果存成main.css

然后呢？
---------
你就可以用less函数了，所有的less库文件可以放在less目录下，比如lib.less中定义了一些函数，将一些重复琐碎的工作交给less函数来完成吧
比如lib.less定义了一个这样的函数

    .border-radius(@radius: 5px) {
	  -webkit-border-radius: @radius;
      -moz-border-radius: @radius;
      border-radius: @radius;
	}

在app/main.less中

    @import "less/lib";

	.box{
	  .border-radius(5px);
	}

在浏览器中输入 http://example.cdn.com/app/main.css ，你将看到

    .box{
	-webkit-border-radius: 5px;
	   -moz-border-radius: 5px;
	        border-radius: 5px;
    }

如果你使用cssGaga
---------------
cssGaga使用的文件后缀名为.source.css
如果你希望less编译后的css文件还要被cssGaga处理，那么配置config.js
lessBuildExtension:'.source.css'，这样编译main.less生成的文件就为main.source.less，再通过cssGaga处理，最终生成main.css。

强烈推荐cssGaga，自动拼图的功能太赞了，可惜依赖.net环境，不能再linux上使用

额外的配置
----------

    pubServer nesir在本机找不到资源的时候会到线上去取
	

note
-----
有很多人都是Apache+PHP开发demo的，这样可能80端口都是默认被占用的，而这个代理工具有事需要80端口的，因为一般线上的cdn都是80端口，这个代理要完全模拟线上的资源路径嘛，所以呢，最好将Apache的端口改下，比如8080，再改下host
127.0.0.1 dev
这样开发demo时
http://dev:8080/demo/index.php
就比较方便了
