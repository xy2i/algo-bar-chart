#!/usr/bin/env bash
rsync -av public/ debian@imag.xy2.dev:/var/www/html/algo-bar --rsync-path="sudo rsync"