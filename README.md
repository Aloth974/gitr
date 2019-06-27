# gitr : git recursive

Call a git command on every repository found from "."

## Install

Clone of download the repository anywhere.

1) Fast and dirty

Create a symbolic link to that script :

    sudo ln -s .../path/to/the/script/gitr /usr/bin/gitr

2) Cleaner

Add ~/bin to the path. Edit this file :

    vim ~/.profile

And add that content to it :

    # set PATH so it includes user's private bin if it exists
    if [ -d "$HOME/bin" ] ; then
        PATH="$HOME/bin:$PATH"
    fi

Then create the symlink into that directory :

    mkdir ~/bin
    sudo ln -s .../path/to/the/script/gitr ~/bin/gitr

You'll probably have to logout / login again to have the directory into your path.
You can add it manually in the meantime (during the console lifetime) :

    export PATH="~/bin:$PATH"