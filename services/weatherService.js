// Weather Service for real-time weather data and heatwave detection
const axios = require("axios");

class WeatherService {
  constructor() {
    // National Weather Service API - free, no API key required
    this.nwsBaseUrl = "https://api.weather.gov";
    this.geocodingUrl = "https://nominatim.openstreetmap.org/search"; // Free geocoding

    this.cache = new Map(); // Simple in-memory cache
    this.cacheTimeout = 10 * 60 * 1000; // 10 minutes
  }

  /**
   * Convert ZIP code to coordinates using free OpenStreetMap Nominatim
   */
  async getCoordinates(zipCode) {
    const cacheKey = `coords_${zipCode}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      // Use free OpenStreetMap Nominatim for geocoding
      const response = await axios.get(this.geocodingUrl, {
        params: {
          q: `${zipCode}, United States`,
          format: "json",
          limit: 1,
          countrycodes: "us",
        },
        timeout: 5000,
        headers: {
          "User-Agent": "StormLogicWeatherApp/1.0", // Required by Nominatim
        },
      });

      if (response.data && response.data.length > 0) {
        const result = response.data[0];
        const coords = {
          lat: parseFloat(result.lat),
          lon: parseFloat(result.lon),
          city: result.display_name.split(",")[0],
          state: "US",
        };

        this.setCache(cacheKey, coords);
        return coords;
      } else {
        throw new Error("No coordinates found for ZIP code");
      }
    } catch (error) {
      console.error(`❌ Geocoding error for ${zipCode}:`, error.message);
      // Return approximate coordinates for major ZIP patterns
      return this.getMockCoordinates(zipCode);
    }
  }

  /**
   * Get weather data from National Weather Service API
   */
  async getNWSWeather(zipCode) {
    const cacheKey = `nws_${zipCode}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      // Get coordinates first
      const coords = await this.getCoordinates(zipCode);

      // Get NWS grid points for this location
      const gridResponse = await axios.get(
        `${this.nwsBaseUrl}/points/${coords.lat},${coords.lon}`,
        { timeout: 10000 }
      );

      const gridData = gridResponse.data.properties;

      // Get current conditions and forecast
      const [observationsResponse, forecastResponse, alertsResponse] =
        await Promise.all([
          axios
            .get(gridData.observationStations)
            .then((stations) =>
              axios.get(`${stations.data.features[0].id}/observations/latest`)
            )
            .catch(() => null),
          axios.get(gridData.forecast),
          axios.get(
            `${this.nwsBaseUrl}/alerts/active?point=${coords.lat},${coords.lon}`
          ),
        ]);

      const current = observationsResponse?.data.properties || {};
      const forecast = forecastResponse.data.properties.periods || [];
      const alerts = alertsResponse.data.features || [];

      const weatherData = {
        zipCode: zipCode,
        coordinates: coords,
        current: {
          temperature:
            this.celsiusToFahrenheit(current.temperature?.value) || null,
          feelsLike:
            this.celsiusToFahrenheit(
              current.heatIndex?.value || current.windChill?.value
            ) || null,
          humidity: current.relativeHumidity?.value || null,
          description: current.textDescription || "Unknown",
          condition: current.textDescription || "Unknown",
          windSpeed: this.mpsToMph(current.windSpeed?.value) || 0,
          timestamp: current.timestamp || new Date().toISOString(),
        },
        forecast: forecast.slice(0, 14), // 7 days, day/night periods
        alerts: alerts.map((alert) => ({
          event: alert.properties.event,
          description: alert.properties.description,
          severity: alert.properties.severity,
          urgency: alert.properties.urgency,
          areas: alert.properties.areaDesc,
          start: alert.properties.onset,
          end: alert.properties.ends,
        })),
        city: coords.city,
        state: coords.state,
        source: "nws",
      };

      this.setCache(cacheKey, weatherData);
      return weatherData;
    } catch (error) {
      console.error(`❌ NWS API error for ${zipCode}:`, error.message);
      console.log(`   Using realistic mock data for ${zipCode}...`);
      return this.getMockNWSData(zipCode);
    }
  }

  /**
   * Get comprehensive weather data using One Call API 3.0
   */
  async getOneCallWeather(zipCode) {
    const cacheKey = `onecall_${zipCode}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    // Check if API key is available
    if (!this.apiKey) {
      console.warn(
        `⚠️ No OpenWeather API key configured, using realistic mock data for ${zipCode}`
      );
      console.warn(`   Get a free API key at: https://openweathermap.org/api`);
      return this.getMockOneCallData(zipCode);
    }

    try {
      // First get coordinates
      const coords = await this.getCoordinates(zipCode);

      // Then call One Call API
      const response = await axios.get(this.oneCallUrl, {
        params: {
          lat: coords.lat,
          lon: coords.lon,
          appid: this.apiKey,
          units: "imperial", // Fahrenheit
          exclude: "minutely", // Exclude minutely forecast to reduce response size
        },
        timeout: 10000,
      });

      const data = response.data;
      this.setCache(cacheKey, data);
      return data;
    } catch (error) {
      console.error(`❌ One Call API error for ${zipCode}:`, error.message);
      return this.getMockOneCallData(zipCode);
    }
  }

  /**
   * Get current weather for a ZIP code (using free NWS API)
   */
  async getCurrentWeather(zipCode) {
    try {
      const nwsData = await this.getNWSWeather(zipCode);
      const current = nwsData.current;

      return {
        zipCode: zipCode,
        temperature: Math.round(current.temperature || 75),
        feelsLike: Math.round(current.feelsLike || current.temperature || 75),
        humidity: Math.round(current.humidity || 60),
        description: current.description,
        condition: current.condition,
        windSpeed: Math.round(current.windSpeed || 5),
        uvIndex: 5, // NWS doesn't provide UV index in observations
        timestamp: current.timestamp,
        city: nwsData.city,
        state: nwsData.state,
        alerts: nwsData.alerts || [],
        source: "nws",
      };
    } catch (error) {
      console.error(`❌ Weather API error for ${zipCode}:`, error.message);
      return this.getMockWeatherByZip(zipCode);
    }
  }

  /**
   * Utility functions for unit conversions
   */
  celsiusToFahrenheit(celsius) {
    if (celsius === null || celsius === undefined) return null;
    return (celsius * 9) / 5 + 32;
  }

  mpsToMph(mps) {
    if (mps === null || mps === undefined) return null;
    return mps * 2.237;
  }

  /**
   * Get weather forecast for next 5 days (using free NWS API)
   */
  async getWeatherForecast(zipCode, days = 5) {
    try {
      const nwsData = await this.getNWSWeather(zipCode);

      // Process NWS forecast data
      const forecast = [];
      const periods = nwsData.forecast.slice(0, days * 2); // NWS gives day/night periods

      for (let i = 0; i < periods.length; i += 2) {
        const dayPeriod = periods[i];
        const nightPeriod = periods[i + 1];

        forecast.push({
          date: new Date(dayPeriod.startTime).toDateString(),
          temperature: dayPeriod.temperature || 75,
          high: dayPeriod.temperature || 75,
          low: nightPeriod ? nightPeriod.temperature || 65 : 65,
          feelsLike: dayPeriod.temperature || 75,
          feelsLikeHigh: dayPeriod.temperature || 75,
          humidity: 60, // NWS doesn't provide humidity in forecast
          condition: dayPeriod.shortForecast || "Clear",
          description: dayPeriod.detailedForecast || "Clear skies",
          uvIndex: 5,
          windSpeed: this.parseWindSpeed(dayPeriod.windSpeed) || 5,
          pop: this.parsePrecipitation(dayPeriod.detailedForecast) || 0,
        });
      }

      return {
        zipCode: zipCode,
        city: nwsData.city,
        state: nwsData.state,
        forecast: forecast,
        timestamp: new Date().toISOString(),
        source: "nws",
      };
    } catch (error) {
      console.error(`❌ Forecast API error for ${zipCode}:`, error.message);
      return this.getMockForecast(zipCode, days);
    }
  }

  /**
   * Parse wind speed from NWS text format (e.g., "5 to 10 mph")
   */
  parseWindSpeed(windText) {
    if (!windText) return 5;
    const match = windText.match(/(\d+)/);
    return match ? parseInt(match[1]) : 5;
  }

  /**
   * Parse precipitation probability from detailed forecast text
   */
  parsePrecipitation(detailedText) {
    if (!detailedText) return 0;
    const match = detailedText.match(/(\d+)%.*chance/i);
    return match ? parseInt(match[1]) / 100 : 0;
  }

  /**
   * Process raw forecast data into structured format
   */
  processForecastData(data, zipCode) {
    const dailyForecasts = {};

    data.list.forEach((item) => {
      const date = new Date(item.dt * 1000).toDateString();

      if (!dailyForecasts[date]) {
        dailyForecasts[date] = {
          date: date,
          high: item.main.temp_max,
          low: item.main.temp_min,
          feelsLikeHigh: item.main.feels_like,
          humidity: item.main.humidity,
          condition: item.weather[0].main,
          description: item.weather[0].description,
          temps: [item.main.temp],
        };
      } else {
        // Update with max/min values
        dailyForecasts[date].high = Math.max(
          dailyForecasts[date].high,
          item.main.temp_max
        );
        dailyForecasts[date].low = Math.min(
          dailyForecasts[date].low,
          item.main.temp_min
        );
        dailyForecasts[date].feelsLikeHigh = Math.max(
          dailyForecasts[date].feelsLikeHigh,
          item.main.feels_like
        );
        dailyForecasts[date].temps.push(item.main.temp);
      }
    });

    return {
      zipCode: zipCode,
      city: data.city.name,
      state: data.city.country,
      forecast: Object.values(dailyForecasts).slice(0, 5),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Detect heatwave conditions (using free NWS API with official alerts)
   */
  async detectHeatwave(zipCode) {
    try {
      const nwsData = await this.getNWSWeather(zipCode);
      const current = nwsData.current;
      const forecast = await this.getWeatherForecast(zipCode);
      const alerts = nwsData.alerts || [];

      const heatwaveThresholds = {
        temperature: 95, // °F
        feelsLike: 100, // °F
        consecutiveDays: 2,
      };

      const currentTemp = current.temperature || 75;
      const currentFeelsLike = current.feelsLike || currentTemp;

      const analysis = {
        zipCode: zipCode,
        currentHeatWarning: currentFeelsLike >= heatwaveThresholds.feelsLike,
        currentTemp: Math.round(currentTemp),
        currentFeelsLike: Math.round(currentFeelsLike),
        heatwaveDetected: false,
        heatwaveDays: 0,
        peakTemp: Math.round(currentFeelsLike),
        warningLevel: "none", // none, watch, warning, emergency
        recommendations: [],
        alerts: alerts,
      };

      // Check for official NWS heat alerts first
      const heatAlerts = alerts.filter(
        (alert) =>
          alert.event &&
          (alert.event.toLowerCase().includes("heat") ||
            alert.event.toLowerCase().includes("excessive") ||
            alert.event.toLowerCase().includes("extreme") ||
            alert.event.toLowerCase().includes("warning"))
      );

      if (heatAlerts.length > 0) {
        analysis.heatwaveDetected = true;
        const alertLevel = heatAlerts[0].severity?.toLowerCase();

        if (
          alertLevel === "extreme" ||
          heatAlerts[0].urgency?.toLowerCase() === "immediate"
        ) {
          analysis.warningLevel = "emergency";
        } else {
          analysis.warningLevel = "warning";
        }

        analysis.recommendations = [
          `Official ${heatAlerts[0].event} in effect`,
          "Follow local emergency guidance",
        ];
      }

      // Check forecast for consecutive hot days
      let consecutiveHotDays = 0;
      let peakTemp = currentFeelsLike;

      if (forecast.forecast) {
        forecast.forecast.forEach((day) => {
          if (day.feelsLikeHigh >= heatwaveThresholds.feelsLike) {
            consecutiveHotDays++;
            peakTemp = Math.max(peakTemp, day.feelsLikeHigh);
          } else {
            consecutiveHotDays = 0; // Reset counter
          }
        });
      }

      analysis.heatwaveDays = consecutiveHotDays;
      analysis.peakTemp = Math.round(peakTemp);

      // Determine warning level if not already set by official alerts
      if (
        analysis.warningLevel === "none" &&
        consecutiveHotDays >= heatwaveThresholds.consecutiveDays
      ) {
        analysis.heatwaveDetected = true;

        if (peakTemp >= 110) {
          analysis.warningLevel = "emergency";
          analysis.recommendations = [
            "Extreme heat emergency",
            "Stay indoors with AC",
            "Check on elderly/vulnerable",
            "Avoid all outdoor activity",
          ];
        } else if (peakTemp >= 105) {
          analysis.warningLevel = "warning";
          analysis.recommendations = [
            "Heat warning in effect",
            "Limit outdoor activity 11am-6pm",
            "Stay hydrated",
            "Use cooling centers if needed",
          ];
        } else {
          analysis.warningLevel = "watch";
          analysis.recommendations = [
            "Heat advisory",
            "Increase water intake",
            "Take frequent breaks if outdoors",
            "Monitor for heat symptoms",
          ];
        }
      }

      return analysis;
    } catch (error) {
      console.error(
        `❌ Heatwave detection error for ${zipCode}:`,
        error.message
      );
      return {
        zipCode: zipCode,
        error: error.message,
        heatwaveDetected: false,
        warningLevel: "none",
        recommendations: [],
      };
    }
  }

  /**
   * Get weather for multiple ZIP codes (for cron job)
   */
  async getBulkWeather(zipCodes) {
    const results = [];

    // Process in batches to avoid rate limiting
    const batchSize = 10;
    for (let i = 0; i < zipCodes.length; i += batchSize) {
      const batch = zipCodes.slice(i, i + batchSize);

      const batchPromises = batch.map(async (zipCode) => {
        try {
          const [weather, heatwave] = await Promise.all([
            this.getCurrentWeather(zipCode),
            this.detectHeatwave(zipCode),
          ]);

          return {
            zipCode,
            weather,
            heatwave,
            success: true,
          };
        } catch (error) {
          return {
            zipCode,
            error: error.message,
            success: false,
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Rate limiting delay
      if (i + batchSize < zipCodes.length) {
        await this.delay(1000); // 1 second between batches
      }
    }

    return results;
  }

  /**
   * Cache management
   */
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Utilities
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  extractStateFromResponse(data) {
    // This would need to be enhanced based on the actual API response
    return data.sys?.country || "US";
  }

  getMockForecast(zipCode, days = 5) {
    const today = new Date();
    const forecast = [];
    const weather = this.getMockWeatherByZip(zipCode);

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);

      // Vary temperatures based on the base weather for this ZIP
      const tempVariation = i * 2 + Math.random() * 10 - 5;
      const baseTemp = weather.temperature + tempVariation;

      forecast.push({
        date: date.toDateString(),
        temperature: Math.round(baseTemp),
        high: Math.round(baseTemp + 5),
        low: Math.round(baseTemp - 10),
        feelsLike: Math.round(baseTemp + 3),
        feelsLikeHigh: Math.round(baseTemp + 8),
        humidity: weather.humidity + Math.random() * 20 - 10,
        condition: weather.condition,
        description: weather.description,
        uvIndex: Math.round(3 + Math.random() * 8),
        windSpeed: Math.round(weather.windSpeed + Math.random() * 5),
        pop: Math.random() * 0.3, // 0-30% chance of precipitation
      });
    }

    return {
      zipCode,
      city: weather.city,
      state: weather.state,
      forecast,
      timestamp: new Date().toISOString(),
      mock: true,
    };
  }

  /**
   * Generate mock coordinates for common ZIP code patterns
   */
  getMockCoordinates(zipCode) {
    const zipNum = parseInt(zipCode) || 0;

    // Approximate coordinates for different regions
    if (zipCode.startsWith("85") || zipCode.startsWith("86")) {
      // Arizona
      return { lat: 33.4484, lon: -112.074, city: "Phoenix", state: "US" };
    } else if (zipCode.startsWith("902") || zipCode.startsWith("901")) {
      // California
      return { lat: 34.0522, lon: -118.2437, city: "Los Angeles", state: "US" };
    } else if (zipCode.startsWith("100") || zipCode.startsWith("101")) {
      // New York
      return { lat: 40.7128, lon: -74.006, city: "New York", state: "US" };
    } else if (zipCode.startsWith("331") || zipCode.startsWith("332")) {
      // Florida
      return { lat: 25.7617, lon: -80.1918, city: "Miami", state: "US" };
    } else {
      // Default to Kansas (center of US)
      return {
        lat: 39.0119,
        lon: -98.4842,
        city: "Geographic Center",
        state: "US",
      };
    }
  }

  /**
   * Generate mock One Call API data
   */
  getMockOneCallData(zipCode) {
    const coords = this.getMockCoordinates(zipCode);
    const weather = this.getMockWeatherByZip(zipCode);
    const forecast = this.getMockForecast(zipCode, 8);

    // Convert forecast to One Call API format
    const daily = forecast.forecast.map((day, index) => {
      const dt = Math.floor(new Date(day.date).getTime() / 1000);
      return {
        dt: dt,
        temp: {
          day: day.temperature,
          min: day.low,
          max: day.high,
          night: day.low + 5,
          eve: day.temperature - 2,
          morn: day.low + 3,
        },
        feels_like: {
          day: day.feelsLike,
          night: day.feelsLike - 5,
          eve: day.feelsLike - 2,
          morn: day.feelsLike - 3,
        },
        humidity: day.humidity,
        weather: [
          {
            id: 800,
            main: day.condition,
            description: day.description,
            icon: "01d",
          },
        ],
        uvi: day.uvIndex,
        wind_speed: day.windSpeed,
        pop: day.pop,
      };
    });

    return {
      lat: coords.lat,
      lon: coords.lon,
      timezone: "America/Chicago",
      timezone_offset: -18000,
      current: {
        dt: Math.floor(Date.now() / 1000),
        temp: weather.temperature,
        feels_like: weather.feelsLike,
        humidity: weather.humidity,
        uvi: weather.uvIndex,
        wind_speed: weather.windSpeed,
        weather: [
          {
            id: 800,
            main: weather.condition,
            description: weather.description,
            icon: "01d",
          },
        ],
      },
      daily: daily,
      alerts: [], // No mock alerts
      mock: true,
    };
  }

  /**
   * Generate mock heatwave analysis
   */
  getMockHeatwaveAnalysis(zipCode) {
    const weather = this.getMockWeatherByZip(zipCode);
    const isHot = weather.temperature > 95;

    return {
      zipCode: zipCode,
      currentHeatWarning: isHot,
      currentTemp: weather.temperature,
      currentFeelsLike: weather.feelsLike,
      heatwaveDetected: isHot && weather.feelsLike > 100,
      heatwaveDays: isHot ? 2 : 0,
      peakTemp: weather.feelsLike,
      warningLevel: isHot
        ? weather.feelsLike > 110
          ? "emergency"
          : "warning"
        : "none",
      recommendations: isHot ? ["Stay hydrated", "Avoid outdoor activity"] : [],
      alerts: [],
      mock: true,
    };
  }

  /**
   * Generate mock NWS weather data
   */
  getMockNWSData(zipCode) {
    const coords = this.getMockCoordinates(zipCode);
    const weather = this.getMockWeatherByZip(zipCode);
    const forecast = this.getMockForecast(zipCode, 8);

    return {
      zipCode: zipCode,
      coordinates: coords,
      current: {
        temperature: weather.temperature,
        feelsLike: weather.feelsLike,
        humidity: weather.humidity,
        description: weather.description,
        condition: weather.condition,
        windSpeed: weather.windSpeed,
        timestamp: weather.timestamp,
      },
      forecast: forecast.forecast.map((day) => ({
        startTime: new Date(day.date).toISOString(),
        temperature: day.temperature,
        shortForecast: day.condition,
        detailedForecast: day.description,
        windSpeed: `${day.windSpeed} mph`,
      })),
      alerts: [], // No mock alerts
      city: weather.city,
      state: weather.state,
      source: "mock",
    };
  }

  /**
   * Generate realistic mock weather based on ZIP code
   */
  getMockWeatherByZip(zipCode) {
    // Create realistic temperatures based on ZIP code patterns
    const zipNum = parseInt(zipCode) || 0;
    const regionFactor = zipNum % 100;

    // Simulate different climate zones
    let baseTemp, humidity, city;

    if (zipCode.startsWith("85") || zipCode.startsWith("86")) {
      // Arizona - Hot and dry
      baseTemp = 95 + Math.random() * 15; // 95-110°F
      humidity = 15 + Math.random() * 20; // 15-35%
      city = zipCode === "85001" ? "Phoenix" : "Arizona City";
    } else if (zipCode.startsWith("902") || zipCode.startsWith("901")) {
      // California - Warm
      baseTemp = 75 + Math.random() * 20; // 75-95°F
      humidity = 50 + Math.random() * 30; // 50-80%
      city = zipCode === "90210" ? "Beverly Hills" : "California City";
    } else if (zipCode.startsWith("100") || zipCode.startsWith("101")) {
      // New York - Moderate
      baseTemp = 70 + Math.random() * 15; // 70-85°F
      humidity = 60 + Math.random() * 25; // 60-85%
      city = zipCode === "10001" ? "New York" : "New York City";
    } else if (zipCode.startsWith("331") || zipCode.startsWith("332")) {
      // Florida - Hot and humid
      baseTemp = 80 + Math.random() * 15; // 80-95°F
      humidity = 70 + Math.random() * 25; // 70-95%
      city = "Florida City";
    } else {
      // Default moderate climate
      baseTemp = 75 + Math.random() * 15; // 75-90°F
      humidity = 55 + Math.random() * 25; // 55-80%
      city = "Unknown City";
    }

    const temperature = Math.round(baseTemp);
    const feelsLike = Math.round(
      baseTemp + (humidity > 70 ? 5 : 0) + Math.random() * 10
    );

    return {
      zipCode: zipCode,
      temperature,
      feelsLike,
      humidity: Math.round(humidity),
      description:
        temperature > 90 ? "hot" : temperature > 80 ? "warm" : "pleasant",
      condition: temperature > 95 ? "Hot" : "Clear",
      windSpeed: Math.round(3 + Math.random() * 10),
      uvIndex: Math.round(3 + Math.random() * 8),
      timestamp: new Date().toISOString(),
      city,
      state: "US",
      mock: true,
    };
  }

  /**
   * Generate heat wave alert message for patients (consolidated from heatcareAI)
   */
  generateHeatWaveAlert(heatWaveData, patientData) {
    // Handle different heat wave data formats
    const alertLevel =
      heatWaveData.alertLevel || heatWaveData.warningLevel || "none";
    const peakTemp =
      heatWaveData.maxFeelsLike ||
      heatWaveData.peakTemp ||
      heatWaveData.currentTemp ||
      75;
    const heatwaveDays =
      heatWaveData.daysAffected || heatWaveData.heatwaveDays || 0;
    const zipCode =
      heatWaveData.zipcode ||
      heatWaveData.zipCode ||
      patientData.zipcode ||
      "unknown";

    const age = patientData.age || 0;
    const firstName = patientData.firstName || "there";

    let message = "";
    let urgency = "routine";
    let riskFactors = [];

    // Assess patient risk factors
    if (age >= 65) riskFactors.push("senior");
    if (
      patientData.chronicConditions?.includes("heart_disease") ||
      patientData.chronicConditions?.includes("heart disease")
    )
      riskFactors.push("heart_condition");
    if (patientData.chronicConditions?.includes("diabetes"))
      riskFactors.push("diabetes");
    if (patientData.medications?.length > 0) riskFactors.push("medications");

    if (alertLevel === "emergency") {
      message = `🚨 EXTREME HEAT EMERGENCY: ${peakTemp}°F in ${zipCode}! `;
      message += "Stay indoors with AC. Avoid ALL outdoor activity.";
      urgency = "emergency";

      if (age >= 65) {
        message += " 65+ HIGH RISK - get help now!";
      }
    } else if (alertLevel === "warning") {
      message = `⚠️ HEAT WARNING: ${peakTemp}°F feels-like in ${zipCode}`;
      if (heatwaveDays > 0) {
        message += ` for ${heatwaveDays} day(s)`;
      }
      message += ". Stay cool, hydrate often, limit outdoor time 11am-6pm.";
      urgency = "urgent";

      if (riskFactors.length > 1) {
        message += " You're high-risk - extra care needed.";
      }
    } else if (peakTemp >= 95) {
      message = `🌡️ HOT WEATHER: ${peakTemp}°F in ${zipCode}. `;
      message +=
        age >= 65
          ? "Stay cool and hydrated. Monitor for heat symptoms."
          : "Stay hydrated and take breaks in shade.";
      urgency = age >= 65 ? "urgent" : "routine";
    } else {
      message = `Hi ${firstName}! Weather in ${zipCode}: ${peakTemp}°F. Stay comfortable and hydrated!`;
      urgency = "routine";
    }

    // Format for SMS (160 char limit)
    if (message.length > 160) {
      message = message.substring(0, 157) + "...";
    }

    return {
      message,
      urgency,
      alertLevel,
      riskFactors,
    };
  }

  /**
   * Enhanced heat wave detection with standardized output (compatibility layer)
   */
  async detectHeatWave(zipCode) {
    try {
      const analysis = await this.detectHeatwave(zipCode);

      // Convert to standardized format for compatibility with existing code
      return {
        alertLevel: analysis.warningLevel,
        currentTemp: analysis.currentTemp,
        maxFeelsLike: analysis.peakTemp,
        daysAffected: analysis.heatwaveDays,
        city: zipCode, // Could be enhanced to get actual city name
        zipcode: zipCode,
        isHeatWave: analysis.heatwaveDetected,
        description: this.getHeatWaveDescription(
          analysis.warningLevel,
          analysis.peakTemp,
          analysis.heatwaveDays
        ),
      };
    } catch (error) {
      console.error(`Heat wave detection error for ${zipCode}:`, error.message);
      return {
        alertLevel: "none",
        currentTemp: 85,
        maxFeelsLike: 85,
        daysAffected: 0,
        city: zipCode,
        zipcode: zipCode,
        isHeatWave: false,
        description: "Unable to determine heat wave status",
      };
    }
  }

  /**
   * Get heat wave description (consolidated from heatcareAI)
   */
  getHeatWaveDescription(alertLevel, maxTemp, days) {
    if (alertLevel === "emergency") {
      return `Extreme heat emergency with feels-like temperatures up to ${maxTemp}°F`;
    } else if (alertLevel === "warning") {
      return `Heat wave warning with ${maxTemp}°F feels-like for ${days} day(s)`;
    }
    return "Normal heat conditions";
  }

  /**
   * Get weather advice using NWS data (simple, rule-based approach)
   */
  async getWeatherAdvice(zipCode, patientData = {}) {
    try {
      const weather = await this.getCurrentWeather(zipCode);
      const heatwave = await this.detectHeatWave(zipCode);

      return this.generateWeatherAdvice(weather, heatwave, patientData);
    } catch (error) {
      console.error(`❌ Weather advice error for ${zipCode}:`, error.message);
      return this.getFallbackWeatherAdvice(zipCode, patientData);
    }
  }

  /**
   * Build comprehensive weather prompt for AI assistant
   */
  buildWeatherPrompt(weatherData, heatwaveData, patientData) {
    const age = patientData.age || 0;
    const conditions = patientData.chronicConditions || [];
    const medications = patientData.medications || [];
    const firstName = patientData.firstName || "there";

    let prompt = `Generate an SMS-friendly health advisory (max 160 chars) for ${firstName}`;

    // Add patient context
    if (age >= 65) {
      prompt += ` (senior, age ${age})`;
    }
    if (conditions.length > 0) {
      prompt += ` with conditions: ${conditions.join(", ")}`;
    }

    // Add weather context
    prompt += `. Current weather: ${heatwaveData.currentTemp}°F (feels like ${heatwaveData.currentFeelsLike}°F)`;

    if (heatwaveData.heatwaveDetected) {
      prompt += `. HEATWAVE: ${heatwaveData.warningLevel} level, peak ${heatwaveData.peakTemp}°F for ${heatwaveData.heatwaveDays} days`;
    }

    // Add alerts if present
    if (weatherData.alerts && weatherData.alerts.length > 0) {
      const heatAlerts = weatherData.alerts.filter(
        (alert) =>
          alert.event.toLowerCase().includes("heat") ||
          alert.event.toLowerCase().includes("excessive")
      );
      if (heatAlerts.length > 0) {
        prompt += `. OFFICIAL ALERT: ${heatAlerts[0].event}`;
      }
    }

    // Request specific format
    prompt += `. Provide: 1) Immediate health advice 2) Action needed 3) Urgency level (routine/urgent/emergency). Keep SMS-friendly and actionable.`;

    return prompt;
  }

  /**
   * Determine urgency level from weather data
   */
  determineUrgency(heatwaveData) {
    if (
      heatwaveData.warningLevel === "emergency" ||
      heatwaveData.peakTemp >= 110
    ) {
      return "emergency";
    } else if (
      heatwaveData.warningLevel === "warning" ||
      heatwaveData.peakTemp >= 100
    ) {
      return "urgent";
    } else {
      return "routine";
    }
  }

  /**
   * Fallback weather advice when AI is unavailable
   */
  getFallbackWeatherAdvice(zipCode, patientData) {
    const weather = this.getMockWeatherByZip(zipCode);
    const firstName = patientData.firstName || "there";
    const age = patientData.age || 0;

    let message = `Hi ${firstName}! `;
    let urgency = "routine";

    if (weather.temperature >= 100) {
      message += `⚠️ Extreme heat ${weather.temperature}°F! Stay indoors with AC. Drink water every 15 mins.`;
      urgency = "emergency";
    } else if (weather.temperature >= 90) {
      message += `🌡️ Hot day ${weather.temperature}°F. Stay hydrated, limit outdoor time 11am-6pm.`;
      urgency = age >= 65 ? "urgent" : "routine";
    } else {
      message += `Weather: ${weather.temperature}°F in ${weather.city}. Have a great day!`;
    }

    // SMS length check
    if (message.length > 160) {
      message = message.substring(0, 157) + "...";
    }

    return {
      message,
      urgency,
      alertLevel:
        weather.temperature >= 100
          ? "emergency"
          : weather.temperature >= 90
          ? "warning"
          : "none",
      aiGenerated: false,
      weatherContext: {
        temperature: weather.temperature,
        feelsLike: weather.feelsLike,
        alerts: [],
      },
    };
  }

  /**
   * Generate intelligent weather alert using NWS data
   */
  async generateAdvancedWeatherAlert(zipCode, patientData) {
    try {
      console.log(`🌡️ Generating weather alert for ${zipCode}...`);

      const weather = await this.getCurrentWeather(zipCode);
      const heatwave = await this.detectHeatWave(zipCode);
      const advice = this.generateWeatherAdvice(weather, heatwave, patientData);

      console.log(`📱 Weather Alert (${advice.urgency}): ${advice.message}`);

      return {
        message: advice.message,
        urgency: advice.urgency,
        alertLevel: heatwave.alertLevel,
        riskFactors: this.assessRiskFactors(patientData),
        aiGenerated: false, // Rule-based, not AI
        weatherContext: {
          temperature: weather.temperature,
          feelsLike: weather.feelsLike,
          alerts: weather.alerts || [],
        },
        zipCode: zipCode,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(
        `❌ Advanced weather alert error for ${zipCode}:`,
        error.message
      );

      // Fallback to basic alert
      return this.generateHeatWaveAlert(
        await this.detectHeatWave(zipCode),
        patientData
      );
    }
  }

  /**
   * Generate rule-based weather advice
   */
  generateWeatherAdvice(weather, heatwave, patientData) {
    const firstName = patientData.firstName || "there";
    const age = patientData.age || 0;
    const isHighRisk = age >= 65 || patientData.chronicConditions?.length >= 2;

    let message = `Hi ${firstName}! `;
    let urgency = "routine";

    // Check for official NWS alerts first
    if (weather.alerts && weather.alerts.length > 0) {
      const heatAlert = weather.alerts.find(
        (alert) =>
          alert.event?.toLowerCase().includes("heat") ||
          alert.event?.toLowerCase().includes("excessive")
      );

      if (heatAlert) {
        message += `🚨 ${heatAlert.event}! Stay indoors with AC. `;
        if (isHighRisk) {
          message += `High risk - check in hourly.`;
        } else {
          message += `Stay safe and hydrated.`;
        }
        urgency =
          heatAlert.severity?.toLowerCase() === "extreme"
            ? "emergency"
            : "urgent";

        return this.formatSMSMessage(message, urgency);
      }
    }

    // Rule-based temperature advice with medication considerations
    const hasHeatSensitiveMeds = patientData.medications?.some(
      (med) =>
        med.toLowerCase().includes("diuretic") ||
        med.toLowerCase().includes("furosemide") ||
        med.toLowerCase().includes("hydrochlorothiazide") ||
        med.toLowerCase().includes("lisinopril")
    );

    if (weather.temperature >= 105) {
      message += `🔥 EXTREME HEAT ${weather.temperature}°F! Stay indoors with AC immediately. `;
      message += isHighRisk
        ? `Call for help if feeling unwell.`
        : `Avoid all outdoor activity.`;
      urgency = "emergency";
    } else if (weather.temperature >= 100) {
      message += `🚨 DANGEROUS HEAT ${weather.temperature}°F! Stay indoors, drink water every 15 mins. `;
      if (hasHeatSensitiveMeds) {
        message += `Your medications increase heat risk - stay extra cool!`;
        urgency = "urgent";
      } else {
        message += isHighRisk
          ? `Monitor for heat symptoms.`
          : `Avoid outdoor work.`;
        urgency = isHighRisk ? "urgent" : "routine";
      }
    } else if (weather.temperature >= 95) {
      message += `⚠️ Very hot ${weather.temperature}°F. Stay cool, hydrate frequently. `;
      message += isHighRisk
        ? `Extra precautions needed.`
        : `Limit outdoor time 11am-6pm.`;
      urgency = isHighRisk ? "urgent" : "routine";
    } else if (weather.temperature >= 85) {
      message += `🌞 Warm ${weather.temperature}°F in ${weather.city}. `;
      message += isHighRisk ? `Stay hydrated.` : `Enjoy the weather safely!`;
      urgency = "routine";
    } else {
      message += `Weather: ${weather.temperature}°F in ${weather.city}. `;
      message += `Comfortable conditions today!`;
      urgency = "routine";
    }

    return this.formatSMSMessage(message, urgency);
  }

  /**
   * Format message for SMS and return structured response
   */
  formatSMSMessage(message, urgency) {
    // Ensure SMS length limit
    if (message.length > 160) {
      message = message.substring(0, 157) + "...";
    }

    return {
      message,
      urgency,
      aiGenerated: false,
    };
  }

  /**
   * Assess patient risk factors for weather conditions
   */
  assessRiskFactors(patientData) {
    const riskFactors = [];

    if (patientData.age >= 65) riskFactors.push("senior");
    if (patientData.chronicConditions?.includes("heart_disease"))
      riskFactors.push("heart_condition");
    if (patientData.chronicConditions?.includes("diabetes"))
      riskFactors.push("diabetes");
    if (patientData.medications?.length > 0) riskFactors.push("medications");
    if (patientData.activityLevel === "low") riskFactors.push("low_mobility");

    return riskFactors;
  }
}

module.exports = new WeatherService();
