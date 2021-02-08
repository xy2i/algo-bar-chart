#!/usr/bin/env python3
""" Parses raw HTML data from scrap/ into data.json. """
import os
import json
from bs4 import BeautifulSoup
from collections import defaultdict


def parse_record(raw_record: str) -> (str, int, str):
    words = raw_record.split(' ')
    team_name = words[0][5:]  # remove "algo_" prefix
    time = int(words[2])
    commit = words[5].rstrip(')')
    return team_name, time, commit


data = defaultdict(list)
for filename in sorted(os.listdir('scrap')):
    date = filename.rstrip(".html")[:8]
    test = int(filename.rstrip(".html")[-1])
    with open(os.path.join('scrap', filename)) as f:
        webpage = f.read()
        soup = BeautifulSoup(webpage, 'html.parser')

        raw_records = [li.text for li in soup.find_all("li")]
        records = list(map(parse_record, raw_records))
        # print(f'{date}/{test}: {records}')
        data[date].append(records)

with open("public/data.json", "w") as f:
    json.dump(data, f)
