# Deployment

## 1. Prepare the TV

1. Install the **Developer Mode** app from the LG Content Store and sign in with an LG developer account.
2. Turn **Dev Mode Status** on (the TV restarts) and **Key Server** on. Note the TV's IP address and passphrase.
   Dev Mode expires after about 50 hours unless you extend it in the app; tap **Extend** now and then.
3. See LG's guide: [webostv.developer.lge.com/develop/getting-started/developer-mode-app](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app).

## 2. Install the webOS CLI

```bash
npm install -g @webos-tools/cli
ares-setup-device                       # add the TV: name, IP, port 9922, user "prisoner"
ares-novacom --device my-lg-tv --getkey # fetch the key with the passphrase shown in the Developer Mode app
ares-setup-device -l                    # list devices
```

## 3. Build and install

```bash
cp js/config.local.example.js js/config.local.js     # then edit it
./package.sh                                         # builds ../com.makeflix.catalog_<version>_all.ipk
./package.sh install my-lg-tv                        # build and install on the TV (add --launch to open it)
```

`package.sh` stages only what the TV needs (no `tools/`, docs or examples) and refuses to build if `config.local.js` still has the placeholder key.

### Wired and Wi-Fi addresses

`./package.sh install my-lg-tv` tries the device named `my-lg-tv` first, then any device whose name starts with `my-lg-tv-`
(for example `my-lg-tv-wifi`), and uses the first one that answers. Register both addresses to install from anywhere.

### Several TVs

Register each TV with its own name in `ares-setup-device` and run `./package.sh install <name>` for each.

## Manual commands

```bash
ares-package <staging-dir> -o ..
ares-install -d my-lg-tv ../com.makeflix.catalog_1.0.0_all.ipk
ares-launch  -d my-lg-tv com.makeflix.catalog
ares-inspect -d my-lg-tv --app com.makeflix.catalog --open    # remote DevTools
```

The app id `com.makeflix.catalog` is a historical name kept so that updates replace the installed app and keep its saved settings.

## Updating

Run `./package.sh install my-lg-tv` again. Settings and watch history are kept because the app id does not change.

## Distribution

The installed app is a developer build and is not published to the LG Content Store. Do not share `.ipk` files that contain your own keys.
