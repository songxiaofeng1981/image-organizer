# Installing Image Organizer

**English** | [中文](INSTALL.zh-CN.md)

This guide assumes no technical background. Follow the steps in order. It takes about 5 minutes.

**You need:** a Mac with macOS 12 (Monterey) or newer, and Google Chrome.
Microsoft Edge, Brave, Arc and Vivaldi also work; the steps are the same.

---

## Step 1: Download

1. Open the [latest release page](https://github.com/songxiaofeng1981/image-organizer/releases/latest).
2. Under **Assets**, click **`image-organizer-v2.2.0.zip`** (the version number may be higher).
   Do not click "Source code": that version needs developer tools.
3. Open your **Downloads** folder and double-click the zip file. A folder named `image-organizer-v2.2.0` appears.

## Step 2: Run the installer

1. Open **Terminal**: press `⌘ Space`, type `Terminal`, press `Return`.
2. In the Terminal window, type `bash` followed by **one space**. Don't press Return yet.
3. Drag **`install.sh`** from the `image-organizer-v2.2.0` folder into the Terminal window.
   The line now looks something like `bash /Users/you/Downloads/image-organizer-v2.2.0/install.sh`.
4. Press `Return`.

After a few seconds it prints **"Done!"** and opens Chrome's extensions page.

> **Why Terminal and not a double-click?** macOS blocks double-clicking scripts that come from the internet,
> and the way around that is buried in System Settings. Starting the script from Terminal avoids the warning.
> The installer only copies files into your user folder. It does not ask for your password.

## Step 3: Add the extension to Chrome

The installer opened `chrome://extensions` for you. If not, type `chrome://extensions` in Chrome's address bar and press Return.

1. Turn on **Developer mode** (the switch at the top right).
2. Click **Load unpacked** (top left).
3. A file window opens. Press `⌘ Shift G`, then `⌘ V` (the installer already copied the folder path for you), then `Return`.
4. Click **Select**.
5. Click the puzzle-piece icon in Chrome's toolbar and click the pin next to **Image Organizer**.

> Developer mode is needed because the extension is not in the Chrome Web Store.
> Chrome may sometimes remind you that a developer-mode extension is installed. That is expected.

## Step 4: Open it

1. Click the **Image Organizer** icon in the toolbar.
2. The first time, macOS asks: *"Image Organizer Helper" would like to access files in your Downloads folder.* Click **Allow**.

Your pictures appear. 🎉

## Step 5: Tidy up

You can delete the `image-organizer-v2.2.0` folder and the zip file now. Everything needed was copied to:

- `~/Applications/Image Organizer/extension` (the extension)
- `~/Library/Application Support/ImageOrganizer` (the helper)

If you keep the folder in Downloads, its own icons will show up in your gallery.

---

## Updating to a new version

1. Download the new zip and unzip it (Step 1).
2. Run `bash install.sh` again (Step 2).
3. In `chrome://extensions`, click the reload icon (↻) on the Image Organizer card.

Your categories and groups are kept.

## Coming from version 1.x ("图片整理（Mac 试用）")

Run the new installer as in Step 2. It notices the old version and updates it in place.
Then click the reload icon (↻) on the old **图片整理** card in `chrome://extensions`. That's all.

**Do not remove the old extension.** Removing an extension also erases what it saved, including your categories and groups.
They carry over automatically when you reload instead.

## Something went wrong?

| What you see | What to do |
|---|---|
| The gallery says **"One more step: install the helper"** | Run Step 2 again. Then check that the ID shown on the Image Organizer card in `chrome://extensions` is `gjmkfcibnihdnoahklpfdjcjekangjhh`. |
| The gallery says **"macOS has not allowed access to Downloads"** | Open **System Settings → Privacy & Security → Files & Folders**, find **Image Organizer Helper**, and turn on **Downloads Folder**. Then click **Try Again**. |
| Terminal says `No such file or directory` | Make sure there is a space after `bash`, and that you dragged `install.sh` (not the folder). |
| Terminal says *No ready-made helper in this folder* | You downloaded "Source code" instead of the release zip. Go back to Step 1. |
| Chrome says **Manifest file is missing or unreadable** | You picked the wrong folder in Step 3. Pick `~/Applications/Image Organizer/extension` (press `⌘ Shift G` and paste it). |
| Some pictures from apps or projects show up | Folders named `node_modules`, `venv`, `Pods` and similar are skipped, and so are hidden files. Other folders inside Downloads are included. |

To check the helper without Chrome, run `bash selftest.sh` in the downloaded folder. It prints how many pictures it found and how long thumbnails take.

Still stuck? [Open an issue](https://github.com/songxiaofeng1981/image-organizer/issues/new/choose). Include your macOS version and what you saw. English or Chinese are both fine.

## Uninstalling

1. Open Terminal, paste this line and press Return. It removes the helper and the extension files. Your pictures are not touched.
   ```bash
   bash "$HOME/Library/Application Support/ImageOrganizer/uninstall.sh"
   ```
2. In `chrome://extensions`, click **Remove** on Image Organizer. This also erases your categories and groups.
