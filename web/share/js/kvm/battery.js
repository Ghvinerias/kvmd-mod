import {tools, $} from "../tools.js";

export function Battery() {
    var self = this;

    var __state = null;
    var __poll_timer = null;
    var __poll_interval = 30000; // 30 seconds

    var __unwrap = function(data) {
        if (data && typeof data === "object" && data.result && typeof data.result === "object") {
            return data.result;
        }
        return data;
    };

    var __normalize = function(raw) {
        raw = __unwrap(raw) || {};
        let out = {...raw};

        out.available = (raw.available === undefined) ? true : !!raw.available;

        let percent = Number(raw.percent);
        out.percent = Number.isFinite(percent) ? percent : NaN;

        let voltage = Number(raw.voltage);
        out.voltage = Number.isFinite(voltage) ? voltage : NaN;

        let rate = raw.rate_per_hour;
        if (typeof rate === "string") {
            const n = Number(rate);
            if (Number.isFinite(n)) rate = n;
        }
        out.rate_per_hour = rate;

        let eta = raw.eta_hours;
        if (typeof eta === "string") {
            const n = Number(eta);
            if (Number.isFinite(n)) eta = n;
        }
        out.eta_hours = eta;

        out.status = (raw.status || "").toString().toLowerCase();
        return out;
    };

    var __init__ = function() {
        __startPolling();
    };

    self.setState = function(state) {
        if (state) {
            __updateBatteryDisplay(__normalize(state));
        }
    };

    var __startPolling = function() {
        if (__poll_timer) {
            clearInterval(__poll_timer);
        }
        __pollBatteryStatus();
        __poll_timer = setInterval(__pollBatteryStatus, __poll_interval);
    };

    var __pollBatteryStatus = function() {
        tools.httpGet("/api/battery", null, function(http) {
            if (http.status === 200) {
                try {
                    let data = JSON.parse(http.responseText);
                    __updateBatteryDisplay(data);
                } catch (e) {
                    console.warn("Battery: Failed to parse or render response:", e);
                    __showBatteryError();
                }
            } else {
                console.warn("Battery: API request failed:", http.status);
                __showBatteryError();
            }
        }, function() {
            console.warn("Battery: API request failed");
            __showBatteryError();
        });
    };

    var __updateBatteryDisplay = function(data) {
        data = __normalize(data);

        if (data.available === false && !Number.isFinite(data.percent)) {
            __showBatteryError();
            return;
        }

        __state = data;

        let batteryNavItem = $("battery-nav-item");
        if (batteryNavItem) {
            batteryNavItem.style.display = "block";
            if (tools.hidden && typeof tools.hidden.setVisible === "function") {
                tools.hidden.setVisible(batteryNavItem, true);
            }
        }

        let topPctText = Number.isFinite(data.percent) ? `${Math.round(data.percent)}%` : "N/A";
        let topTextEl = $("battery-text");
        if (topTextEl) topTextEl.innerText = topPctText;

        let led = $("battery-led");
        if (led) led.className = __getBatteryLedClass(data);

        let percentEl = $("battery-percent-value");
        if (percentEl) {
            percentEl.innerText = Number.isFinite(data.percent) ? `${data.percent.toFixed(1)}%` : "N/A";
        }

        let voltEl = $("battery-voltage-value");
        if (voltEl) {
            voltEl.innerText = Number.isFinite(data.voltage) ? `${data.voltage.toFixed(2)}V` : "N/A";
        }

        let statusEl = $("battery-status-value");
        if (statusEl) {
            statusEl.innerText = __formatStatus(data.status);
        }

        let rateEl = $("battery-rate-value");
        if (rateEl) {
            if (typeof data.rate_per_hour === "number" && Number.isFinite(data.rate_per_hour)) {
                rateEl.innerText = `${data.rate_per_hour.toFixed(2)}%/h`;
            } else {
                rateEl.innerText = (data.rate_per_hour !== undefined && data.rate_per_hour !== null && data.rate_per_hour !== "") ? `${data.rate_per_hour}` : "N/A";
            }
        }

        let etaEl = $("battery-eta-value");
        if (etaEl) {
            if (typeof data.eta_hours === "number" && Number.isFinite(data.eta_hours)) {
                etaEl.innerText = __formatETA(data.eta_hours);
            } else {
                etaEl.innerText = (data.eta_hours !== undefined && data.eta_hours !== null && data.eta_hours !== "") ? `${data.eta_hours}` : "N/A";
            }
        }
    };

    var __showBatteryError = function() {
        let batteryNavItem = $("battery-nav-item");
        if (batteryNavItem) {
            batteryNavItem.style.display = "block";
        }

        let topTextEl = $("battery-text");
        if (topTextEl) topTextEl.innerText = "N/A";

        let led = $("battery-led");
        if (led) led.className = "led-battery led-gray";

        let percentEl = $("battery-percent-value");
        if (percentEl) percentEl.innerText = "N/A";

        let voltEl = $("battery-voltage-value");
        if (voltEl) voltEl.innerText = "N/A";

        let statusEl = $("battery-status-value");
        if (statusEl) statusEl.innerText = "Unknown";

        let rateEl = $("battery-rate-value");
        if (rateEl) rateEl.innerText = "N/A";

        let etaEl = $("battery-eta-value");
        if (etaEl) etaEl.innerText = "N/A";

        __state = null;
    };

    var __getBatteryLedClass = function(data) {
        let baseClass = "led-battery";
        let statusClass = "";
        const p = Number.isFinite(data.percent) ? data.percent : 0;

        if (p >= 75) {
            statusClass = "led-battery-full";
        } else if (p >= 50) {
            statusClass = "led-battery-high";
        } else if (p >= 25) {
            statusClass = "led-battery-medium";
        } else if (p >= 10) {
            statusClass = "led-battery-low";
        } else {
            statusClass = "led-battery-critical";
        }

        if (data.status === "charging") {
            return `${baseClass} ${statusClass} led-green`;
        } else if (data.status === "discharging" && p < 20) {
            return `${baseClass} ${statusClass} led-red`;
        } else if (data.status === "discharging" && p < 35) {
            return `${baseClass} ${statusClass} led-yellow`;
        } else {
            return `${baseClass} ${statusClass} led-gray`;
        }
    };

    var __formatStatus = function(status) {
        switch (status) {
            case "charging": return "Charging";
            case "discharging": return "Discharging";
            case "idle": return "Idle";
            default: return "Unknown";
        }
    };

    var __formatETA = function(hours) {
        if (!Number.isFinite(hours)) {
            return "N/A";
        }
        if (hours < 1) {
            return `${Math.round(hours * 60)}m`;
        } else if (hours < 24) {
            let h = Math.floor(hours);
            let m = Math.round((hours - h) * 60);
            return `${h}h ${m}m`;
        } else {
            let d = Math.floor(hours / 24);
            let h = Math.round(hours % 24);
            return `${d}d ${h}h`;
        }
    };

    __init__();
}
