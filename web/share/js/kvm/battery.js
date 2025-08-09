/*****************************************************************************
#                                                                            #
#    KVMD - The main PiKVM daemon.                                           #
#                                                                            #
#    Copyright (C) 2018-2024  Maxim Devaev <mdevaev@gmail.com>               #
#                                                                            #
#    This program is free software: you can redistribute it and/or modify    #
#    it under the terms of the GNU General Public License as published by    #
#    the Free Software Foundation, either version 3 of the License, or       #
#    (at your option) any later version.                                     #
#                                                                            #
#    This program is distributed in the hope that it will be useful,         #
#    but WITHOUT ANY WARRANTY; without even the implied warranty of          #
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the           #
#    GNU General Public License for more details.                            #
#                                                                            #
#    You should have received a copy of the GNU General Public License       #
#    along with this program.  If not, see <https://www.gnu.org/licenses/>.  #
#                                                                            #
*****************************************************************************/


"use strict";


import {tools, $} from "../tools.js";


export function Battery() {
	var self = this;

	/************************************************************************/

	var __state = null;
	var __poll_timer = null;
	var __poll_interval = 30000; // 30 seconds

	var __init__ = function() {
		// Start polling for battery data
		__startPolling();
	};

	/************************************************************************/

	self.setState = function(state) {
		// This would be called by the WebSocket if kvmd provides battery data
		// For now, we use HTTP polling since pipwrmonitor is external
		if (state && state.available !== undefined) {
			__updateBatteryDisplay(state);
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
					console.warn("Battery: Failed to parse response:", e);
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
		if (!data.available) {
			__showBatteryError();
			return;
		}

		__state = data;

		// Always show the battery nav item (remove any hidden classes)
		let batteryNavItem = $("battery-nav-item");
		if (batteryNavItem) {
			batteryNavItem.style.display = "block";
			tools.hidden.setVisible(batteryNavItem, true);
		}

		// Update battery percentage text
		$("battery-text").innerText = `${Math.round(data.percent)}%`;

		// Update battery LED based on status and percentage
		let led = $("battery-led");
		led.className = __getBatteryLedClass(data);

		// Update detailed information
		$("battery-percent-value").innerText = `${data.percent.toFixed(1)}%`;
		$("battery-voltage-value").innerText = `${data.voltage.toFixed(2)}V`;
		$("battery-status-value").innerText = __formatStatus(data.status);

		if (typeof data.rate_per_hour === 'number') {
			$("battery-rate-value").innerText = `${data.rate_per_hour.toFixed(2)}%/h`;
		} else {
			$("battery-rate-value").innerText = data.rate_per_hour;
		}

		if (typeof data.eta_hours === 'number') {
			$("battery-eta-value").innerText = __formatETA(data.eta_hours);
		} else {
			$("battery-eta-value").innerText = data.eta_hours || "N/A";
		}
	};

	var __showBatteryError = function() {
		// Keep the battery nav item visible but show error state
		let batteryNavItem = $("battery-nav-item");
		if (batteryNavItem) {
			batteryNavItem.style.display = "block";
		}
		
		// Show error in the UI
		$("battery-text").innerText = "N/A";
		let led = $("battery-led");
		led.className = "led-battery led-gray";
		
		__state = null;
	};

	var __getBatteryLedClass = function(data) {
		let baseClass = "led-battery";
		let statusClass = "";
		
		// Determine battery level class
		if (data.percent >= 75) {
			statusClass = "led-battery-full";
		} else if (data.percent >= 50) {
			statusClass = "led-battery-high";
		} else if (data.percent >= 25) {
			statusClass = "led-battery-medium";
		} else if (data.percent >= 10) {
			statusClass = "led-battery-low";
		} else {
			statusClass = "led-battery-critical";
		}

		// Override with status-specific colors
		if (data.status === "charging") {
			return `${baseClass} ${statusClass} led-green`;
		} else if (data.status === "discharging" && data.percent < 20) {
			return `${baseClass} ${statusClass} led-red`;
		} else if (data.status === "discharging" && data.percent < 35) {
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
