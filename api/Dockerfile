# Build context: the api/ folder. Render builds this through render.yaml.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY src/Claymores.Api/Claymores.Api.csproj src/Claymores.Api/
RUN dotnet restore src/Claymores.Api/Claymores.Api.csproj
COPY src/Claymores.Api/ src/Claymores.Api/
RUN dotnet publish src/Claymores.Api/Claymores.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
# Render sets PORT, which the API listens on. 8080 is the fallback for local docker run.
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "Claymores.Api.dll"]
