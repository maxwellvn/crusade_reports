# Local city data

`cities15000.json` is generated from the GeoNames `cities15000` export and is
used for city autocomplete and map coordinates without runtime Places API calls.

GeoNames data is licensed under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).
Source: [GeoNames geographical database](https://www.geonames.org/).

To refresh the catalogue, run:

```sh
node scripts/build-local-cities.mjs
```
