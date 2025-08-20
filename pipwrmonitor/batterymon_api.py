#!/usr/bin/env python3
from flask import Flask, jsonify
from smbus2 import SMBus
from collections import deque
import time
import threading

ADDR = 0x36
SAMPLE_INTERVAL = 30  # seconds between samples
SMOOTH_WINDOW = 10  # number of samples to average
MIN_DELTA = 0.05  # ignore smaller % changes

app = Flask(__name__)

# Shared state
history = deque(maxlen=SMOOTH_WINDOW)
last_percent = None
last_time = None
current_voltage = None
current_percent = None
direction = "idle"


# --- I2C Read helpers ---
def read_voltage(bus):
    v_data = bus.read_i2c_block_data(ADDR, 0x02, 2)
    raw_voltage = (v_data[0] << 4) | (v_data[1] >> 4)
    return raw_voltage * 1.25 / 1000


def read_percentage(bus):
    p_data = bus.read_i2c_block_data(ADDR, 0x04, 2)
    return p_data[0] + p_data[1] / 256


def estimate_time(rate_per_hour, percent_now, direction):
    if rate_per_hour <= 0:
        return None
    if direction == "discharging":
        return percent_now / rate_per_hour
    elif direction == "charging":
        return (100 - percent_now) / rate_per_hour


# --- Background updater ---
def monitor_loop():
    global last_percent, last_time, current_voltage, current_percent, direction

    with SMBus(1) as bus:
        last_percent = read_percentage(bus)
        last_time = time.time()
        current_voltage = read_voltage(bus)
        current_percent = last_percent

        while True:
            time.sleep(SAMPLE_INTERVAL)

            now_percent = read_percentage(bus)
            now_voltage = read_voltage(bus)
            now_time = time.time()

            delta_percent = now_percent - last_percent
            delta_time_hr = (now_time - last_time) / 3600

            if abs(delta_percent) >= MIN_DELTA and delta_time_hr > 0:
                rate = delta_percent / delta_time_hr
                history.append(rate)

            # Determine direction
            if history:
                avg_rate = sum(history) / len(history)
                if avg_rate > 0:
                    direction = "charging"
                elif avg_rate < 0:
                    direction = "discharging"
                else:
                    direction = "idle"
            else:
                avg_rate = 0
                direction = "idle"

            current_voltage = now_voltage
            current_percent = now_percent
            last_percent = now_percent
            last_time = now_time


# --- API Endpoint ---
@app.route("/api/battery")
def battery_status():
    if current_voltage is None or current_percent is None:
        return jsonify({"error": "No data yet"}), 503

    if len(history) < SMOOTH_WINDOW:
        rate_display = "still calculating"
        eta_display = "still calculating"
    else:
        avg_rate = sum(history) / len(history)
        rate_per_hour = abs(avg_rate)
        rate_display = round(rate_per_hour, 2)
        eta_hours = estimate_time(rate_per_hour, current_percent, direction)
        eta_display = round(eta_hours, 2) if eta_hours else None

    return jsonify(
        {
            "available": True,
            "voltage": round(current_voltage, 3),
            "percent": round(current_percent, 2),
            "status": direction,
            "rate_per_hour": rate_display,
            "eta_hours": eta_display,
        }
    )


if __name__ == "__main__":
    # Start background thread
    t = threading.Thread(target=monitor_loop, daemon=True)
    t.start()
    app.run(host="0.0.0.0", port=5000)
