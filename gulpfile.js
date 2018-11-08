const { src } = require('gulp');
const fs = require('fs');
const gutil = require('gulp-util');
const clean = require('gulp-clean');
const exec  = require('child_process').exec;
const _     = require('lodash');
const iconv = require('iconv-lite');

const shpPath = {  
    ctprvn : {
        source : 'shapefiles/CTPRVN_201804/TL_SCCO_CTPRVN.shp',
        convert : 'shapefiles/CTPRVN_201804/TL_SCCO_CTPRVN_simplify.shp',
        json : 'dist/ctprvn.json'
    },
    sig : {
        source : 'shapefiles/SIG_201804/TL_SCCO_SIG.shp',
        convert : 'shapefiles/SIG_201804/TL_SCCO_SIG_simplify.shp',
        json : 'dist/sig.json'
    },
    emd : {
        source : 'shapefiles/EMD_201804/TL_SCCO_EMD.shp',
        convert : 'shapefiles/EMD_201804/TL_SCCO_EMD_simplify.shp',
        json : 'dist/emd.json'
    }
}

function convertTask(cb) {
    // clean shp
    src(['dist/*.json', 'src/**/*_simplify.*']).pipe(clean());

    // simplify shp & convert shp to geojson
    for (var key in shpPath) {
        console.log('==========');

        mapshaper(key);
    }
    cb();
}

exports.default = convertTask;

function mapshaper(key) {  
    var command = 'mapshaper -i '
                + shpPath[key].source
                + ' encoding=euc-kr -simplify weighted 1% -proj latlong -o format=shapefile '
                + shpPath[key].convert;

    console.log(command);

    exec(command, function (error, stdout, stderr) {
        if (error) {
            console.error(`exec error: ${error}`);
            return;
        }

        console.log(stdout);
        console.log(stderr);

        console.log('=> convert size')
        console.log('%s : %d bytes', shpPath[key].source,  fs.statSync(shpPath[key].source).size);
        console.log('%s : %d bytes', shpPath[key].convert, fs.statSync(shpPath[key].convert).size);
        console.log('=>');

        ogr2ogr(key);
    });
}

function ogr2ogr(key) {  
    var command = 'ogr2ogr -f GeoJSON -lco COORDINATE_PRECISION=3 "'
                + shpPath[key].json
                +'" "' + shpPath[key].convert + '"';

    console.log(command);

    exec(command, function (error, stdout, stderr) {
        if (error) {
            console.error(`exec error: ${error}`);
            return;
        }

        console.log(stdout);
        console.log(stderr);

        console.log('=> convert json size')
        console.log('%s : %d bytes', shpPath[key].json, fs.statSync(shpPath[key].json).size);
        console.log('=>')

        renameProperties(key);
    });
}

function renameProperties(key) {
        console.log("\n *Rename GeoJSON Properties START* \n");
    console.log(key);

    var fileName = shpPath[key].json;
    var contents = fs.readFileSync(fileName);
    var features ={};
    contents = iconv.decode(contents, 'euc-kr');

    var jsonContent = JSON.parse(contents);
    jsonContent.features.forEach((feature) => {
        switch(key) {
            case 'ctprvn':
                feature.properties.code = feature.properties['CTPRVN_CD'];
              feature.properties.name = feature.properties['CTP_ENG_NM'];
              feature.properties.label = feature.properties['CTP_KOR_NM'];
              delete feature.properties['CTPRVN_CD'];
              delete feature.properties['CTP_ENG_NM'];
              delete feature.properties['CTP_KOR_NM'];
                break;
            case 'sig':
                feature.properties.code = feature.properties['SIG_CD'];
              feature.properties.name = feature.properties['SIG_ENG_NM'];
              feature.properties.label = feature.properties['SIG_KOR_NM'];
              delete feature.properties['SIG_CD'];
              delete feature.properties['SIG_ENG_NM'];
              delete feature.properties['SIG_KOR_NM'];
                break;
            case 'emd':
                feature.properties.code = feature.properties['EMD_CD'];
              feature.properties.name = feature.properties['EMD_ENG_NM'];
              feature.properties.label = feature.properties['EMD_KOR_NM'];
              delete feature.properties['EMD_CD'];
              delete feature.properties['EMD_ENG_NM'];
              delete feature.properties['EMD_KOR_NM'];
                break;
        }
    });


    fs.writeFileSync(shpPath[key].json, JSON.stringify(jsonContent));

    console.log("\n *End rename task* \n");

    splitGeojson(key);
}

function splitGeojson(type) {  
    console.log("\n *Split geoJSON START* \n");
    console.log(type);

    // clean split
    if (!fs.existsSync(`dist/${type}`)){
        fs.mkdirSync(`dist/${type}`);
    }

    src(`dist/${type}/*.json`).pipe(clean());

    var fileName = shpPath[type].json;
    //var exception = [ "47940" ];
    var exception = [];

    // 시군구 데이터 sido 별로 자르기
    var contents = fs.readFileSync(fileName);
    var features ={};
    contents = iconv.decode(contents, 'utf-8');

    var jsonContent = JSON.parse(contents);

    for (var key in jsonContent.features) {
        var feature = jsonContent.features[key];
        var subKey, cd, name;

        if (type == 'sig') {
            cd = feature.properties.code;
            name = feature.properties.label;
            subKey = feature.properties.code.substr(0, 2);
        } else if (type == 'emd') {
            cd = feature.properties.code;
            name = feature.properties.label;
            subKey = feature.properties.code.substr(0, 5);
        }

        console.log(`feature.properties.cd: ${cd}, feature.properties.name: ${name}`);

        if (features.hasOwnProperty(subKey)) {
            if (!_.has(exception, cd)) {
                features[subKey].push(feature);
            }
        } else {
            features[subKey] = [];

            if (!_.has(exception, cd)) {
                features[subKey].push(feature);
            }
        }
    }

    for (var key in features) {
        var featuresCollection = _.template('{"type": "FeatureCollection", "features": [ \
                <% _.forEach(iterator, function(val, index, list) { %> \
                \n  <%= JSON.stringify(val) %><% \
                if (index < list.length - 1) { \
                %>, <% \
                } \
                }); %> \
            \n]}');

        var jsonStr = featuresCollection({
            'iterator': features[key]
        });

        // split json파일 생성
        fs.writeFileSync("dist/" + type + "/" + key + ".json", jsonStr);
    }

    console.log("\n *EXIT* \n");
}