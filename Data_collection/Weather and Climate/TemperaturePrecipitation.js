// Load the ERA5 dataset
var era5 = ee.ImageCollection("ECMWF/ERA5_LAND/DAILY_AGGR")
             .select('temperature_2m');

// Add your polygon geometry, here I addedd a table from my personal assets
var geometry = table;

// Filter the dataset to your region of interest and time period
var startYear = 1960;  // Adjust start year
var endYear = 2024;    // Adjust end year

// Function to compute annual mean temperature in Celsius
var annualTemp = ee.ImageCollection(
  ee.List.sequence(startYear, endYear).map(function(year) {
    var yearStart = ee.Date.fromYMD(year, 1, 1);
    var yearEnd = ee.Date.fromYMD(year, 12, 31);
    
    // Filter for the year
    var yearImages = era5.filterDate(yearStart, yearEnd);
    
    // Check if the collection is empty
    var annualMean = ee.Algorithms.If(
      yearImages.size().gt(0),
      yearImages.mean().subtract(273.15).set('year', year), // Convert to Celsius and tag year
      null // Return null if no data
    );
    
    return annualMean;
  })
).filter(ee.Filter.notNull(['system:index'])); // Remove null entries

// Reduce to region and get the mean temperature for each year
var annualTempStats = annualTemp.map(function(image) {
  var stats = image.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geometry,
    scale: 1000, // Adjust scale as needed
    maxPixels: 1e13
  });
  return ee.Feature(null, stats).set('year', image.get('year'));
});

// Convert to a FeatureCollection
var annualTempFC = ee.FeatureCollection(annualTempStats);

// Print results
print('Annual Average Temperature (Celsius):', annualTempFC);

// Prepare data for plotting with trend line and custom formatting
var chart = ui.Chart.feature.byFeature({
  features: annualTempFC,
  xProperty: 'year',
  yProperties: ['temperature_2m']
})
.setChartType('ScatterChart') // Use ScatterChart for a clear trend
.setOptions({
  title: 'Annual Average Temperature with Trend Line',
  hAxis: {
    title: 'Year',
    format: '####', // Format x-axis as a plain year
    gridlines: {count: 10}
  },
  vAxis: {title: 'Temperature (°C)'},
  series: {
    0: {color: "#ffaf7a"} // Light blue for the points
  },
  trendlines: {
    0: { // Trend line options
      color: 'red',
      lineWidth: 1,
      opacity: 0.4,
      type: 'linear',
      lineDashStyle: [4, 8,4]
    }
  },
  pointSize: 5,
  lineWidth: 1
});

// Display the chart
print(chart);

// 1. DEFINITIONS (Needed to make the code run)
// Load the CHIRPS Daily dataset. The band is named 'precipitation'.
var chirps = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
               .select('precipitation');

// Add your polygon geometry (assumed to be the variable 'table' from your temp script)
var geometry = table;

// Filter the dataset to your region of interest and time period
var startYear = 1960;  // Adjust start year
var endYear = 2024;    // Adjust end year

// 2. ANNUAL AGGREGATION

// Function to compute annual TOTAL precipitation in millimeters (mm)
var annualPrecip = ee.ImageCollection(
  ee.List.sequence(startYear, endYear).map(function(year) {
    var yearStart = ee.Date.fromYMD(year, 1, 1);
    var yearEnd = ee.Date.fromYMD(year, 12, 31);
    
    // Filter for the year
    var yearImages = chirps.filterDate(yearStart, yearEnd);
    
    // Check if the collection is empty
    var annualSum = ee.Algorithms.If(
      yearImages.size().gt(0),
      // SUM the daily precipitation images for the year.
      // CHIRPS data is already in mm, so no multiplication is needed.
      yearImages.sum().set('year', year), 
      null // Return null if no data
    );
    
    return annualSum;
  })
).filter(ee.Filter.notNull(['system:index'])); // Remove null entries

// 3. REGIONAL REDUCTION

// Reduce to region and get the mean precipitation for each year
var annualPrecipStats = annualPrecip.map(function(image) {
  var stats = image.reduceRegion({
    reducer: ee.Reducer.mean(), // Calculate the spatial mean of the annual total
    geometry: geometry,
    scale: 5566, // CHIRPS nominal scale is ~5.5 km
    maxPixels: 1e13
  });
  // The band is still named 'precipitation' in the stats dictionary.
  return ee.Feature(null, stats).set('year', image.get('year'));
});

// Convert to a FeatureCollection
var annualPrecipFC = ee.FeatureCollection(annualPrecipStats);

// Print results
print('Annual Total Precipitation (mm):', annualPrecipFC);

// 4. CHARTING AND VISUALIZATION

// Prepare data for plotting with trend line and custom formatting
var chart = ui.Chart.feature.byFeature({
  features: annualPrecipFC,
  xProperty: 'year',
  yProperties: ['precipitation'] // Use the CHIRPS band name
})
.setChartType('ScatterChart') 
.setOptions({
  title: 'Annual Total Precipitation (CHIRPS) with Trend Line',
  hAxis: {
    title: 'Year',
    format: '####', 
    gridlines: {count: 10}
  },
  vAxis: {title: 'Precipitation (mm)'}, // Updated V-Axis label
  series: {
    0: {color: "#007acc"} // Blue for precipitation
  },
  trendlines: {
    0: { 
      color: 'red',
      lineWidth: 1,
      opacity: 0.4,
      type: 'linear',
      lineDashStyle: [4, 8,4]
    }
  },
  pointSize: 5,
  lineWidth: 1
});

// Display the chart
print(chart);
