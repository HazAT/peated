package entity

import (
	"net/http"

	"github.com/gin-gonic/gin"

	e "peated/api/resource/common/err"
	"peated/api/router/middleware"
	"peated/auth"
	"peated/config"
	"peated/database"
	"peated/database/model"
	"peated/pkg/validate"

	"github.com/go-playground/validator/v10"
	"github.com/rs/zerolog"
	"gorm.io/gorm"
)

func SliceEqual(s1 []string, s2 []string) bool {
	if len(s1) != len(s2) {
		return false
	}

	for n, v := range s1 {
		if v != s2[n] {
			return false
		}
	}

	return true
}

type API struct {
	logger     *zerolog.Logger
	db         *gorm.DB
	repository *Repository
}

func Routes(r *gin.Engine, config *config.Config, logger *zerolog.Logger, db *gorm.DB) {
	api := &API{
		logger:     logger,
		db:         db,
		repository: NewRepository(db),
	}

	r.GET("/entities", api.entityList)
	r.POST("/entities", middleware.ModRequired(config, logger, db), api.entityCreate)
	r.GET("/entities/:id", api.entityById)
	r.DELETE("/entities/:id", middleware.ModRequired(config, logger, db), api.entityDelete)
	r.PUT("/entities/:id", middleware.ModRequired(config, logger, db), api.entityUpdate)
	r.POST("/entities/:id/merge", middleware.ModRequired(config, logger, db), api.entityMerge)
}

func (a *API) entityList(ctx *gin.Context) {
	var query ListInput
	if err := ctx.ShouldBindQuery(&query); err != nil {
		var details []*validate.ValidationErrDetail
		if vErrs, ok := err.(validator.ValidationErrors); ok {
			details = validate.ValidationErrorDetails(&query, "form", vErrs)
		}
		e.NewBadRequest(ctx, e.InvalidParameters(details))
		return
	}

	entities, err := a.repository.List(ctx, &query)

	if err != nil {
		a.logger.Error().Err(err).Msg("")
		e.NewServerError(ctx, e.RespDBDataAccessFailure)
		return
	}

	ctx.JSON(200, NewEntitiesResponse(ctx, entities))
}

func (a *API) entityById(ctx *gin.Context) {
	type RequestUri struct {
		ID uint64 `uri:"id" binding:"numeric"`
	}
	var uri RequestUri

	if err := ctx.ShouldBindUri(&uri); err != nil {
		var details []*validate.ValidationErrDetail
		if vErrs, ok := err.(validator.ValidationErrors); ok {
			details = validate.ValidationErrorDetails(&uri, "uri", vErrs)
		}
		e.NewBadRequest(ctx, e.InvalidParameters(details))
		return
	}

	entity, err := a.repository.ReadByTombstone(ctx, uri.ID)
	if err != nil {
		if !database.IsRecordNotFoundErr(err) {
			a.logger.Error().Err(err).Msg("")
			e.NewServerError(ctx, e.RespDBDataAccessFailure)
			return
		}

		entity, err = a.repository.ReadById(ctx, uri.ID)
		if err != nil {
			if database.IsRecordNotFoundErr(err) {
				e.NewNotFound(ctx, e.RespNotFound)
				return
			}

			a.logger.Error().Err(err).Msg("")
			e.NewServerError(ctx, e.RespDBDataAccessFailure)
			return
		}
	}

	ctx.JSON(200, NewEntityResponse(ctx, entity))
}

func (a *API) entityCreate(ctx *gin.Context) {
	var data EntityInput
	if err := ctx.ShouldBindJSON(&data); err != nil {
		var details []*validate.ValidationErrDetail
		if vErrs, ok := err.(validator.ValidationErrors); ok {
			details = validate.ValidationErrorDetails(&data, "json", vErrs)
		}
		e.NewBadRequest(ctx, e.InvalidParameters(details))
		return
	}

	currentUser, _ := auth.CurrentUser(ctx)

	// TODO: validate type
	newEntity, err := a.repository.Create(ctx, &model.Entity{
		Name:            data.Name,
		ShortName:       data.ShortName.Value,
		Type:            data.Type,
		Country:         data.Country.Value,
		Region:          data.Region.Value,
		Website:         data.Website.Value,
		YearEstablished: data.YearEstablished.Value,
		CreatedByID:     currentUser.ID,
	})
	if err != nil {
		if database.IsKeyConflictErr(err) {
			e.NewConflict(ctx, e.RespConflict)
			return
		}
		a.logger.Error().Err(err).Msg("")
		e.NewServerError(ctx, e.RespDBDataInsertFailure)
		return
	}

	ctx.JSON(http.StatusCreated, NewEntityResponse(ctx, newEntity))
}

func (a *API) entityDelete(ctx *gin.Context) {
	type RequestUri struct {
		ID uint64 `uri:"id" binding:"numeric"`
	}
	var uri RequestUri

	if err := ctx.ShouldBindUri(&uri); err != nil {
		var details []*validate.ValidationErrDetail
		if vErrs, ok := err.(validator.ValidationErrors); ok {
			details = validate.ValidationErrorDetails(&uri, "uri", vErrs)
		}
		e.NewBadRequest(ctx, e.InvalidParameters(details))
		return
	}

	currentUser, ok := auth.CurrentUser(ctx)
	if !ok {
		a.logger.Error().Msg("this should not be reachable (entityCreate.currentUser)")
		e.NewServerError(ctx, e.RespDBDataAccessFailure)
		return
	}

	err := a.repository.Delete(ctx, uri.ID, currentUser)
	if err != nil {
		if database.IsRecordNotFoundErr(err) {
			e.NewNotFound(ctx, e.RespNotFound)
			return
		}
		a.logger.Error().Err(err).Msg("")
		e.NewServerError(ctx, e.RespDBDataRemoveFailure)
		return
	}

	ctx.JSON(http.StatusNoContent, gin.H{})
}

func (a *API) entityUpdate(ctx *gin.Context) {
	type RequestUri struct {
		ID uint64 `uri:"id" binding:"numeric"`
	}
	var uri RequestUri

	if err := ctx.ShouldBindUri(&uri); err != nil {
		var details []*validate.ValidationErrDetail
		if vErrs, ok := err.(validator.ValidationErrors); ok {
			details = validate.ValidationErrorDetails(&uri, "uri", vErrs)
		}
		e.NewBadRequest(ctx, e.InvalidParameters(details))
		return
	}

	var data EntityUpdateInput
	if err := ctx.ShouldBindJSON(&data); err != nil {
		var details []*validate.ValidationErrDetail
		if vErrs, ok := err.(validator.ValidationErrors); ok {
			details = validate.ValidationErrorDetails(&data, "json", vErrs)
		}
		e.NewBadRequest(ctx, e.InvalidParameters(details))
		return
	}

	entity, err := a.repository.ReadById(ctx, uri.ID)
	if err != nil {
		if database.IsRecordNotFoundErr(err) {
			e.NewNotFound(ctx, e.RespNotFound)
			return
		}
		a.logger.Error().Err(err).Msg("")
		e.NewServerError(ctx, e.RespDBDataAccessFailure)
		return
	}

	currentUser, _ := auth.CurrentUser(ctx)

	var values map[string]interface{} = make(map[string]interface{})
	if data.Name.Defined && data.Name.Value != &entity.Name {
		values["name"] = data.Name.Value
	}
	if data.ShortName.Defined && data.ShortName.Value != entity.ShortName {
		values["short_name"] = data.ShortName.Value
	}
	if data.Country.Defined && data.Country.Value != entity.Country {
		values["country"] = data.Country.Value
	}
	if data.Region.Defined && data.Region.Value != entity.Region {
		values["region"] = data.Region.Value
	}
	if data.Type.Defined && ((data.Type.Value == nil && entity.Type != nil) || !SliceEqual(*data.Type.Value, entity.Type)) {
		values["type"] = data.Type.Value
	}

	err = a.repository.Update(ctx, entity, values, currentUser)
	if err != nil {
		if database.IsKeyConflictErr(err) {
			e.NewKeyConflict(ctx, "name", values["name"])
			return
		}
		a.logger.Error().Err(err).Msg("")
		e.NewServerError(ctx, e.RespDBDataRemoveFailure)
		return
	}

	// TODO:
	// if (newEntity.name !== entity.name || !newEntity.description) {
	// 	try {
	// 	  await pushJob("GenerateEntityDetails", { entityId: entity.id });
	// 	} catch (err) {
	// 	  logError(err, {
	// 		entity: {
	// 		  id: entity.id,
	// 		},
	// 	  });
	// 	}
	//   }

	ctx.JSON(http.StatusOK, NewEntityResponse(ctx, entity))
}
