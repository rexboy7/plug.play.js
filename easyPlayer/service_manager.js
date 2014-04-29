(function(exports) {
  var DEBUG = false;
  'use strict';

  var savedServices = {};

  var debugEl;
  var audioPlayer;
  var videoPlayer;
  var imagePlayer;
  var unknownPlayer;
  var discoverButton;
  var currentPlayer;
  var playerToggler;
  var folderList;

  function debugLog(msg, level) {
    if (!DEBUG && level == 'debug') {
      return;
    }
    var logEl = document.createElement('div');
    logEl.textContent = msg;
    debugEl.appendChild(logEl);
  }

  function toggleFolder(evt) {
    evt.preventDefault();
    var elem = evt.target;

    if (elem.nextSibling && elem.nextSibling.tagName == 'DIV') {
      // folder is opened. Close it.
      elem.parentElement.removeChild(elem.nextSibling);
      elem.classList.remove('opened');
    } else {
      // folder is closed. Open it.
      debugLog(elem.serviceId, 'debug');
      elem.classList.add('opened');
      browseFolder(
        elem.dataset.serviceId, elem.hash.substr(1), evt.target);
    }
  }

  function togglePlayer(value) {
    if (typeof value != 'boolean') {
      value = currentPlayer.classList.contains('hide');
    }
    audioPlayer.classList.add('hide');
    videoPlayer.classList.add('hide');
    imagePlayer.classList.add('hide');
    unknownPlayer.classList.add('hide');
    if (value) {
      currentPlayer.classList.remove('hide');
    }
  }

  function switchPlayer(type) {
    if (type == 'audio') {
      currentPlayer = audioPlayer;
    } else if (type == 'video') {
      currentPlayer = videoPlayer;
    } else if (type == 'image') {
      currentPlayer = imagePlayer;
    } else if (type == 'unknown') {
      currentPlayer = unknownPlayer;
    }
    togglePlayer(true);
  }

  function playFile(evt) {
    evt.preventDefault();
    var fileType = evt.target.dataset.type;
    var fileFormat = evt.target.dataset.mime.split('/')[1].toLowerCase();
    if (fileFormat == 'mpeg' || fileFormat == 'mp4') {
      // Workaround for mp4 is not supported by opera
      fileType = 'unknown';
    }

    switchPlayer(fileType);

    currentPlayer.hidden = false;
    currentPlayer.src = evt.target.href;
    currentPlayer.oncanplay = function() {
      this.play();
    };
  }

  function detectTypeByMime(mimeText) {
    var type = mimeText.split('/')[0];
    var format = mimeText.split('/')[1];
    switch (type) {
      case 'audio':
      case 'video':
      case 'image':
        return type;
      case 'application':
        switch (format) {
          case 'ogg':
            return 'video';
          case 'octet-stream':
            return 'unknown';
        }
        break;
      default:
        return 'unknown';
    }
  }

  function browseFolder(serviceId, folderId, folderElement) {
    var mediaServer = savedServices[serviceId];
    if (!mediaServer) {
      return;
    }

    folderId = folderId || '';

    mediaServer.browse(folderId).then(function(response) {
      if (!response || !response.data) {
        return;
      }


      var data = response.data.Result;
      if (data.indexOf('xmlns:dlna') == -1) {
        data = data.replace('<DIDL-Lite ',
          '<DIDL-Lite xmlns:dlna="urn:schemas-dlna-org:device-1-0" ');
      }
      var parser = new DOMParser();
      var serializer = new XMLSerializer();
      var xmlResponse = parser.parseFromString(data, 'application/xml');
      var lists = xmlResponse.documentElement.children;

      var sublist = document.createElement('div');
      sublist.className = 'sublist';

      for (var i = 0; i < lists.length; i++) {
        var item = lists[i];

        var titleElem = item.getElementsByTagName('title')[0];
        var title;
        if (titleElem) {
          title = titleElem.textContent;
        }

        var newElem;
        if (item.tagName == 'container') {
          newElem = document.createElement('a');

          newElem.dataset.serviceId = serviceId;
          newElem.addEventListener('click', toggleFolder);
          newElem.href = '#' + item.getAttribute('id');
          newElem.textContent = title;
          newElem.className = 'folder';

          sublist.appendChild(newElem);
        } else if (item.tagName == 'item') {
          var linkElem = item.getElementsByTagName('res')[0];
          var link, mime;
          if (linkElem) {
            link = linkElem.textContent;
            mime = linkElem.getAttribute('protocolInfo').split(':')[2];
          }
          var fileType = detectTypeByMime(mime);
          newElem = document.createElement('a');
          newElem.addEventListener('click', playFile);
          newElem.dataset.mime = mime;
          newElem.dataset.type = fileType;
          newElem.href = link;
          newElem.textContent = title;
          newElem.className = fileType;
          sublist.appendChild(newElem);
        }
      }
      if (!folderElement) {
        folderList.appendChild(sublist);
      } else {
        folderElement.parentElement.
            insertBefore(sublist, folderElement.nextSibling);
      }

      debugLog(serializer.serializeToString(xmlResponse), 'debug');
    });
  }

  function remove(serviceId) {
    var serverItem = savedServices[serviceId].serverItem;
    removeSiblingList(serverItem);
    serverItem.parentElement.removeChild(serverItem);
    delete savedServices[serviceId];
  }

  function removeSiblingList(elem) {
    if (elem.nextElementSibling.classList.contains('sublist')) {
      elem.parentElement.removeChild(elem.nextElementSibling);
    }
  }

  function refresh(evt) {
    var serverItem = evt.target;
    var serviceId = serverItem.dataset.serviceId;
    serverItem.removeEventListener('click', refresh);
    serverItem.classList.remove('needRefresh');

    var service = savedServices[serviceId];
    removeSiblingList(service.serverItem);
    browseFolder(serviceId, null, service.serverItem);
  }

  function addRefreshLink(serviceId) {
    var serverItem = savedServices[serviceId].serverItem;
    serverItem.classList.add('needRefresh');
    serverItem.addEventListener('click', refresh);
  }

  function onServices(services) {

    debugLog(services.length + ' service' +
    (services.length !== 1 ? 's' : '') +
    ' found in the current network');

    for (savedServiceId in savedServices) {
      var removed = true;
      for (i = 0; i < services.length; i++) {
        if (services[i].id == savedServiceId) {
          removed = false;
          break;
        }
      }
      if (removed) {
        remove(savedServiceId);
      }
    }

    for (i = 0; i < services.length; i++) {
      var service = services[i];
      service._index = i;

      var mediaServer =
        new Plug.UPnP_ContentDirectory(service, { debug: false });

      if (!savedServices[service.id]) {
        savedServices[service.id] = mediaServer;

        // Add server node
        var serverItem = document.createElement('div');
        serverItem.className = 'server';
        serverItem.textContent = mediaServer.configDocument.
          getElementsByTagName('friendlyName')[0].textContent;
        serverItem.dataset.serviceId = service.id;
        folderList.appendChild(serverItem);

        mediaServer.serverItem = serverItem;

        browseFolder(service.id, null, serverItem);
      }

      mediaServer.getSystemUpdateId().then(function(response) {
        if (response && response.data) {
          debugLog('Service[' + service._index + '] is reporting UpdateId=[' +
            response.data.Id + ']');
          if (savedServices[service.id].updateId != response.data.Id) {
            addRefreshLink(service.id);
            savedServices[service.id].updateId = response.data.Id;
          }
        } else {
          debugLog('Service[' + service._index + '] is reporting no response');
        }
      }).then(null, function(error) { // Handle any errors
        debugLog('An error occurred: ' + error.description);
      });
    }
  }

  function discover() {
    if (navigator.getNetworkServices) {
      debugLog('Searching for UPnP services in the current network...');
      navigator.getNetworkServices(
        'upnp:urn:schemas-upnp-org:service:ContentDirectory:1',
        onServices,
        function(e) {
          debugLog('An error occurred obtaining UPnP Services [CODE: ' +
                    error.code + ']');
      });
    } else {
      debugLog(
          'navigator.getNetworkServices API is not supported in this browser');
    }
  }

  function init() {
    var audioToggler = document.getElementById('audioToggler');
    var videoToggler = document.getElementById('videoToggler');
    var imageToggler = document.getElementById('imageToggler');
    folderList = document.getElementById('folderList');
    debugEl = document.getElementById('debug');
    audioPlayer = document.getElementById('audioPlayer');
    videoPlayer = document.getElementById('videoPlayer');
    imagePlayer = document.getElementById('imagePlayer');
    playerToggler = document.getElementById('playerToggler');
    unknownPlayer = document.getElementById('unknownPlayer');
    discoverButton = document.getElementById('discoverButton');

    currentPlayer = imagePlayer;
    togglePlayer(false);

    playerToggler.addEventListener('click', togglePlayer);
    audioToggler.addEventListener('click', switchPlayer.bind(null, 'audio'));
    videoToggler.addEventListener('click', switchPlayer.bind(null, 'video'));
    imageToggler.addEventListener('click', switchPlayer.bind(null, 'image'));
    unknownToggler.addEventListener(
                                'click', switchPlayer.bind(null, 'unknown'));
    discoverButton.addEventListener('click', discover);

    discover();
  }

  window.addEventListener('load', function() {
    init();
  });

  exports.ServiceManager = {
    savedServices: savedServices
  };
})(window);
